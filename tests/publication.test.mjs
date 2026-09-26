import assert from "node:assert/strict";
import { test } from "node:test";
import { load } from "./load.mjs";
const p = await import(await load("publication"));
const { Connection } = await import(await load("connection"));
const id = "KRMZ", id2 = "TQVA";
const config = { environment: "http://127.0.0.1:54321", key: "sb_publishable_test" };
const schedule = { Երկուշաբթի: [{ start: "09:00", end: "10:00", lesson: "Դաս" }] };
const publication = (changes = {}) => ({ formatVersion: 2, joinCode: id, revision: 1, publishedAt: "2026-09-26T10:00:00Z", schoolName: "Դպրոց", className: "5Ա", timezone: "Asia/Yerevan", schedule, ...changes });
const record = (value = publication()) => ({ version: 3, environment: config.environment, joinCode: value?.joinCode ?? id, publication: value });
const kind = expected => error => error.kind === expected;
test("publication envelope validates identity, metadata, timezone, format and empty schedule", () => {
  assert.deepEqual(p.validatePublication(publication(), id), publication());
  assert.deepEqual(p.validatePublication(publication({ schedule: {} }), id).schedule, {});
  for (const change of [{ joinCode: id2 }, { revision: 0 }, { revision: 1.5 }, { publishedAt: "yesterday" }, { publishedAt: "2026-02-30T00:00:00Z" }, { schoolName: " " }, { className: null }, { timezone: "Mars/Olympus" }, { timezone: "+04:00" }, { schedule: [] }]) assert.throws(() => p.validatePublication(publication(change), id), kind("payload"));
  assert.throws(() => p.validatePublication({}, id), kind("payload"));
  assert.throws(() => p.validatePublication(publication({ publishedAt: "2026-09-26T24:00:00Z" }), id), kind("payload"));
  assert.throws(() => p.validatePublication(publication({ formatVersion: 3 }), id), kind("format"));
  assert.equal(p.joinCode(` ${id.toLowerCase()} `), id);
  assert.throws(() => p.joinCode("class 5"), kind("code"));
});
test("build config normalizes the endpoint, permits public keys and rejects secrets", () => {
  assert.equal(p.publicationConfig(config.environment + "/", config.key).environment, config.environment);
  for (const [url, key] of [[undefined, undefined], ["http://school.example", config.key], [config.environment, "sb_secret_no"], [config.environment, "a." + btoa('{"role":"service_role"}') + ".b"], ["https://user:pass@example.com", config.key]]) assert.throws(() => p.publicationConfig(url, key), kind("config"));
});
test("RPC distinguishes null, empty, HTTP, malformed payload and network", async () => {
  const fetcher = async (url, init) => {
    assert.equal(url, config.environment + "/rest/v1/rpc/get_published_schedule");
    assert.deepEqual(JSON.parse(init.body), { p_join_code: id });
    assert.equal(init.headers.apikey, config.key);
    return Response.json(publication({ schedule: {} }));
  };
  assert.deepEqual((await p.fetchPublication(config, id, fetcher)).schedule, {});
  assert.equal(await p.fetchPublication(config, id, async () => Response.json(null)), null);
  await assert.rejects(p.fetchPublication(config, id, async () => new Response("failed", { status: 503 })), kind("network"));
  await assert.rejects(p.fetchPublication(config, id, async () => { throw new Error("offline"); }), kind("network"));
  await assert.rejects(p.fetchPublication(config, id, async () => new Response("not json")), kind("payload"));
  await assert.rejects(p.fetchPublication(config, id, async () => Response.json(publication({ formatVersion: 3 }))), kind("format"));
});
test("10 second timeout aborts a stalled RPC", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const pending = p.fetchPublication(config, id, (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason))));
  t.mock.timers.tick(10_000);
  await assert.rejects(pending, kind("timeout"));
});
test("versioned cache rejects Gist, corrupt, future and mismatched publication data", () => {
  for (const value of [schedule, [], { ...record(), version: 4 }, record(publication({ timezone: "bad" })), { ...record(), joinCode: id2 }]) assert.throws(() => p.validateCache(value));
  const cache = p.validateCache(record());
  assert.equal(p.matchingCache(cache, config.environment, id).revision, 1);
  assert.equal(p.matchingCache(cache, "https://school.supabase.co", id), null);
  assert.equal(p.matchingCache(cache, config.environment, id2), null);
  assert.equal(p.matchingCache(record(null), config.environment, id), null);
});
function fixture(saved = null) {
  let token = 0, fail = false, response = publication();
  const views = [];
  const storage = { read: async () => structuredClone(saved), begin: async () => ++token,
    commit: async (current, value, cached) => { assert.equal(current, token); if (fail) throw new Error("disk full"); if (!cached) saved = structuredClone(value); } };
  const connection = () => new Connection(config, storage, view => views.push(view), async () => {
    if (response instanceof Error) throw response;
    return typeof response === "function" ? response() : structuredClone(response);
  });
  return { connection, views, response: value => { response = value; }, fail: value => { fail = value; }, saved: () => saved };
}
test("confirmation persists selected class; failed lookup/save keeps previous connection", async () => {
  const f = fixture(), c = f.connection();
  assert.equal(await c.restore(), false);
  await c.preview(id); assert.equal(f.saved(), null); await c.confirm();
  assert.equal(f.saved().joinCode, id);
  f.response(new Error("offline")); await assert.rejects(c.preview(id2)); assert.equal(c.selection.joinCode, id);
  f.response(publication({ joinCode: id2 })); await c.preview(id2); f.fail(true);
  await assert.rejects(c.confirm()); assert.equal(c.selection.joinCode, id); assert.equal(f.saved().joinCode, id);
  f.fail(false); await c.confirm(); assert.equal(c.selection.joinCode, id2);
});
test("offline restart, new revision, persistent null and empty publication", async () => {
  const f = fixture(record()), c = f.connection(); await c.restore();
  f.response(new Error("offline")); await c.refresh(); assert.equal(f.views.at(-1).source, "cached");
  f.response(publication({ revision: 2 })); await c.refresh(); assert.equal(f.saved().publication.revision, 2);
  f.response(null); await c.refresh(); assert.equal(f.saved().publication, null); assert.equal(f.views.at(-1).publication, null);
  const restart = f.connection(); await restart.restore(); f.response(new Error("offline")); await assert.rejects(restart.refresh());
  f.response(publication({ revision: 3, schedule: {} })); await restart.refresh(); assert.deepEqual(f.saved().publication.schedule, {});
});
test("storage refusal is reported and malformed/future caches are preserved", async () => {
  const f = fixture(record()), c = f.connection(); await c.restore(); f.fail(true); f.response(null);
  await assert.rejects(c.refresh(), /offline/); assert.equal(f.views.at(-1).publication, null);
  const invalid = fixture({ ...record(), version: 99 }); await assert.rejects(invalid.connection().restore()); assert.equal(invalid.saved().version, 99);
  const other = fixture({ ...record(), environment: "https://other.supabase.co" }); assert.equal(await other.connection().restore(), false);
});
test("late response cannot replace confirmed new class, cache or active view", async () => {
  const f = fixture(record()), c = f.connection(); await c.restore();
  let finish;
  f.response(() => new Promise(resolve => { finish = resolve; }));
  const old = c.refresh(); await new Promise(resolve => setImmediate(resolve));
  f.response(publication({ joinCode: id2 })); await c.preview(id2); await c.confirm();
  finish(publication({ revision: 40 })); await old;
  assert.equal(f.saved().joinCode, id2); assert.equal(f.views.at(-1).publication.joinCode, id2);
});
