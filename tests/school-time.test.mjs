import assert from "node:assert/strict";
import { test } from "node:test";
import { load } from "./load.mjs";
const { schoolTime, schoolInstant, lessonProgress, schoolSummary } = await import(await load("school-time"));
test("school date, midnight, summary and progress are independent of computer timezone", () => {
  const now = new Date("2026-09-20T20:30:00Z");
  assert.deepEqual(schoolTime(now, "Asia/Yerevan"), { date: "2026-09-21", weekday: 1, time: "00:30", second: 0 });
  const lesson = { start: "00:00", end: "01:00", lesson: "Դաս" };
  assert.equal(lessonProgress(lesson, now, "Asia/Yerevan"), 50);
  assert.equal(schoolSummary([lesson], now, "Asia/Yerevan"), "Հիմա՝ Դաս · մինչև 01:00");
  assert.equal(schoolSummary([lesson], now, "America/New_York"), "");
});
test("DST skips missing endpoints and resolves repeated times to the first instant", () => {
  const zone = "America/New_York";
  assert.equal(schoolInstant("2026-03-08", "02:30", zone), undefined);
  assert.equal(schoolInstant("2026-11-01", "01:30", zone), Date.parse("2026-11-01T05:30:00Z"));
  const lesson = { start: "01:00", end: "01:45", lesson: "Դաս" };
  assert.equal(lessonProgress(lesson, new Date("2026-11-01T06:30:00Z"), zone), undefined);
  assert.equal(schoolSummary([lesson], new Date("2026-11-01T06:30:00Z"), zone), "");
  assert.equal(schoolSummary([{ ...lesson, start: "02:00", end: "03:30" }], new Date("2026-03-08T07:15:00Z"), zone), "Այսօր դասեր չկան։");
  assert.equal(schoolInstant("2026-10-04", "02:15", "Australia/Lord_Howe"), undefined);
});
