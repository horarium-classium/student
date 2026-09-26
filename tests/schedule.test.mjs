import assert from "node:assert/strict";
import { test } from "node:test";
import { load } from "./load.mjs";
const { validateSchedule } = await import(await load("schedule"));

test("invalid times, names, intervals and overlaps are rejected", () => {
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
  for (const [lessons, error] of invalidCases) assert.throws(() => validateSchedule({ Երկուշաբթի: lessons }), error);
});
test("days, empty schedules, sorting and adjacency", () => {
  assert.deepEqual(validateSchedule({}), {});
  assert.throws(() => validateSchedule({ Monday: [] }), /Unknown weekday/);
  assert.throws(() => validateSchedule({ Երկուշաբթի: [{}] }), /Invalid start/);
  for (const bad of [null, [], 7]) assert.throws(() => validateSchedule(bad));
  const lessons = [{ start: "10:00", end: "23:59", lesson: " B " }, { start: "00:00", end: "10:00", lesson: "A" }];
  assert.deepEqual(validateSchedule({ Երկուշաբթի: lessons, Երեքշաբթի: [] }), {
    Երկուշաբթի: [{ ...lessons[1] }, { ...lessons[0], lesson: "B" }], Երեքշաբթի: [],
  });
});
