import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/schedule.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source.replace('import { invoke } from "@tauri-apps/api/core";', 'const invoke = (...args) => globalThis.cacheInvoke(...args);'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
});
let moduleId = 0;
const freshModule = () => import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}#${moduleId++}`);
const timetable = { Երկուշաբթի: [{ start: "09:00", end: "09:45", lesson: "Մաթեմատիկա" }] };

function mockStorage(t, storage) {
  globalThis.cacheStorage = storage;
  globalThis.cacheInvoke = async (command, args) => {
    if (command === "read_schedule_cache") return globalThis.cacheStorage.getItem("schedule");
    if (command === "write_schedule_cache") return globalThis.cacheStorage.setItem("schedule", args.data);
    throw new Error(`Unexpected command: ${command}`);
  };
  t.after(() => { delete globalThis.cacheStorage; delete globalThis.cacheInvoke; });
}

test("schedule cache survives reloads and handles remote/storage failures", async (t) => {
  const storage = new Map();
  t.mock.method(globalThis, "fetch", async () => Response.json(timetable));
  mockStorage(t, {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  });

  const initial = await freshModule();
  await initial.loadSchedules();
  assert.deepEqual(initial.schedule, timetable);
  assert.equal(storage.size, 1);
  const [key, cached] = [...storage.entries()][0];

  for (const failure of [
    async () => { throw new TypeError("offline"); },
    async () => new Response("unavailable", { status: 503 }),
    async () => new Response("not JSON"),
    async () => Response.json([]),
    async () => Response.json({ Երկուշաբթի: [{}] }),
  ]) {
    globalThis.fetch = failure;
    const reloaded = await freshModule();
    await reloaded.loadSchedules();
    assert.deepEqual(reloaded.schedule, timetable);
    assert.equal(storage.get(key), cached);
    assert.deepEqual(reloaded.getTodayLessons(new Date(2026, 8, 21)), timetable.Երկուշաբթի);
  }

  const offlineError = new TypeError("offline");
  globalThis.fetch = async () => { throw offlineError; };
  for (const invalid of [null, "broken JSON", "[]", '{"Monday":[{}]}']) {
    storage.clear();
    if (invalid !== null) storage.set(key, invalid);
    const reloaded = await freshModule();
    await assert.rejects(reloaded.loadSchedules(), (error) => error === offlineError);
  }

  storage.set(key, cached);
  const updated = { Երկուշաբթի: [] };
  globalThis.fetch = async () => Response.json(updated);
  await initial.loadSchedules();
  assert.deepEqual(JSON.parse(storage.get(key)), updated);

  t.mock.method(globalThis.cacheStorage, "setItem", () => { throw new Error("quota"); });
  globalThis.fetch = async () => Response.json(timetable);
  await initial.loadSchedules();
  assert.deepEqual(initial.schedule, timetable);

  t.mock.method(globalThis.cacheStorage, "getItem", () => { throw new Error("storage disabled"); });
  globalThis.fetch = async () => { throw offlineError; };
  await assert.rejects(initial.loadSchedules(), (error) => error === offlineError);
});

test("a stalled request falls back after the timeout", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  mockStorage(t, { getItem: () => JSON.stringify(timetable) });
  t.mock.method(globalThis, "fetch", (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  }));
  const module = await freshModule();
  const loading = module.loadSchedules();
  t.mock.timers.tick(10_000);
  await loading;
  assert.deepEqual(module.schedule, timetable);
});

test("invalid schedules are rejected remotely and in cache without replacing valid data", async (t) => {
  const lesson = (start, end, name = "Դաս") => ({ start, end, lesson: name });
  const invalidCases = [
    ...["9:00", "09:0", "24:00", "12:60", "-1:00", " 09:00", "09:00 ", "09:00\n", "09:00:00", "ab:cd"].flatMap((time) => [
      [[lesson(time, "10:00")], /Invalid time/],
      [[lesson("08:00", time)], /Invalid time/],
    ]),
    [[lesson("09:00", "09:00")], /start must be before end/],
    [[lesson("10:00", "09:00")], /start must be before end/],
    [[lesson("23:00", "01:00")], /start must be before end/],
    [[lesson("09:00", "10:00", "")], /Empty lesson name/],
    [[lesson("09:00", "10:00", " \t\n")], /Empty lesson name/],
    [[lesson("09:00", "10:00"), lesson("09:30", "10:30")], /Overlapping lessons/],
    [[lesson("10:00", "11:00"), lesson("09:00", "10:30")], /Overlapping lessons/],
    [[lesson("09:00", "12:00"), lesson("10:00", "11:00")], /Overlapping lessons/],
    [[lesson("09:00", "10:00"), lesson("09:00", "10:00")], /Overlapping lessons/],
  ];
  let cached = null;
  let writes = 0;
  mockStorage(t, {
    getItem: () => cached,
    setItem: () => { writes++; },
  });
  t.mock.method(globalThis, "fetch");
  const module = await freshModule();
  const offline = new Error("offline");

  for (const [lessons, expectedError] of invalidCases) {
    const invalid = { Երկուշաբթի: lessons };
    cached = null;
    globalThis.fetch = async () => Response.json(invalid);
    await assert.rejects(module.loadSchedules(), expectedError);

    cached = JSON.stringify(timetable);
    await module.loadSchedules();
    assert.deepEqual(module.schedule, timetable);
    assert.equal(cached, JSON.stringify(timetable));

    cached = JSON.stringify(invalid);
    globalThis.fetch = async () => { throw offline; };
    await assert.rejects(module.loadSchedules(), (error) => error === offline);
    assert.deepEqual(module.schedule, timetable);
  }
  assert.equal(writes, 0);
});

test("valid boundaries, adjacent lessons, unsorted input and separate days are accepted", async (t) => {
  const valid = {
    Երկուշաբթի: [
      { start: "10:00", end: "23:59", lesson: "Երկրորդ դաս" },
      { start: "00:00", end: "10:00", lesson: "Առաջին դաս" },
    ],
    Երեքշաբթի: [{ start: "00:00", end: "10:00", lesson: "Դաս" }],
    Չորեքշաբթի: [],
  };
  let saved;
  mockStorage(t, { setItem: (_key, value) => { saved = JSON.parse(value); } });
  t.mock.method(globalThis, "fetch", async () => Response.json(valid));
  const module = await freshModule();
  await module.loadSchedules();
  const expected = { ...valid, Երկուշաբթի: [...valid.Երկուշաբթի].reverse() };
  assert.deepEqual(module.schedule, expected);
  assert.deepEqual(saved, expected);
});


test("unknown weekdays and missing fields identify the invalid location", async () => {
  const { validateSchedule } = await freshModule();
  assert.throws(() => validateSchedule({ Monday: [] }), /Unknown weekday: Monday/);
  assert.throws(() => validateSchedule({ Երկուշաբթի: [{ start: "09:00", lesson: "Դաս" }] }), /Invalid end for Երկուշաբթի, lesson 1/);
  assert.deepEqual(validateSchedule({}), {});
});


test("manual refresh preserves the active schedule on network or validation failure", async (t) => {
  let saved;
  mockStorage(t, { setItem: (_key, data) => { saved = data; }, getItem: () => { throw new Error("must not fall back during refresh"); } });
  t.mock.method(globalThis, "fetch", async () => Response.json(timetable));
  const module = await freshModule();
  assert.equal((await module.loadSchedules()).source, "online");
  globalThis.fetch = async () => Response.json({ Unknown: [] });
  await assert.rejects(module.loadSchedules(false), /Unknown weekday/);
  assert.deepEqual(module.schedule, timetable);
  assert.deepEqual(JSON.parse(saved), timetable);
  globalThis.fetch = async () => { throw new Error("offline"); };
  await assert.rejects(module.loadSchedules(false), /offline/);
  assert.deepEqual(module.schedule, timetable);
});
