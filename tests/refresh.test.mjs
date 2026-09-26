import assert from "node:assert/strict";
import { test } from "node:test";
import { load } from "./load.mjs";
const { ScheduleRefresh, REFRESH_INTERVAL_MS } = await import(await load("refresh"));

test("schedule refresh waits 15 minutes, then repeats and coalesces missed periods", async () => {
  let now = 0, calls = 0;
  const clock = new ScheduleRefresh(async () => { calls++; }, () => true, () => now);
  assert.equal(REFRESH_INTERVAL_MS, 900_000);
  now = 899_999; await clock.tick(); assert.equal(calls, 0);
  now++; await clock.tick(); assert.equal(calls, 1);
  await clock.tick(); assert.equal(calls, 1);
  now += 900_000; await clock.tick(); assert.equal(calls, 2);
  now += 10 * 900_000; await clock.tick(); await clock.tick(); assert.equal(calls, 3);
});

test("blocked refresh stays due until selection and UI are ready; successful manual load resets it", async () => {
  let now = 0, allowed = false, calls = 0;
  const clock = new ScheduleRefresh(async () => { calls++; }, () => allowed, () => now);
  now = 900_000; await clock.tick(); assert.equal(calls, 0);
  allowed = true; await clock.tick(); assert.equal(calls, 1);
  now += 800_000; clock.reset();
  now += 100_000; await clock.tick(); assert.equal(calls, 1);
  now += 800_000; await clock.tick(); assert.equal(calls, 2);
});

test("pending refresh cannot overlap, and failure permits the next scheduled attempt", async () => {
  let now = 0, calls = 0, reject;
  const clock = new ScheduleRefresh(() => {
    calls++;
    return new Promise((_resolve, fail) => { reject = fail; });
  }, () => true, () => now);
  now = 900_000;
  const pending = clock.tick();
  const failure = assert.rejects(pending, /offline/);
  now += 900_000; await clock.tick(); assert.equal(calls, 1);
  reject(new Error("offline")); await failure;
  const retry = clock.tick(); const nextFailure = assert.rejects(retry, /offline/);
  assert.equal(calls, 2); reject(new Error("offline")); await nextFailure;
});
