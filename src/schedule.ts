import type { Schedule } from "./types";

export const dayNames: Record<number, string> = {
  1: "Երկուշաբթի",
  2: "Երեքշաբթի",
  3: "Չորեքշաբթի",
  4: "Հինգշաբթի",
  5: "Ուրբաթ",
  6: "Շաբաթ",
  7: "Կիրակի",
};

export function validateSchedule(value: unknown): Schedule {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Schedule must be a JSON object.");
  }

  const remoteSchedule = value as Record<string, unknown>;
  const validated: Schedule = {};
  for (const [dayName, lessons] of Object.entries(remoteSchedule)) {
    if (!Object.values(dayNames).includes(dayName)) {
      throw new Error(`Unknown weekday: ${dayName}.`);
    }
    if (!Array.isArray(lessons)) {
      throw new Error(`Invalid schedule data for ${dayName}.`);
    }

    for (const [index, lesson] of lessons.entries()) {
      const location = `${dayName}, lesson ${index + 1}`;
      if (typeof lesson !== "object" || lesson === null || Array.isArray(lesson)) {
        throw new Error(`Invalid lesson object for ${location}.`);
      }
      for (const field of ["start", "end", "lesson"]) {
        if (typeof lesson[field] !== "string") throw new Error(`Invalid ${field} for ${location}: expected text.`);
      }
      const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
      for (const field of ["start", "end"]) {
        if (lesson[field].length !== 5 || !timePattern.test(lesson[field])) {
          throw new Error(`Invalid time for ${location}, ${field}: expected HH:MM (00:00–23:59).`);
        }
      }
      // Validated, zero-padded HH:MM strings sort chronologically.
      if (lesson.start >= lesson.end) {
        throw new Error(`Invalid interval for ${location}: start must be before end.`);
      }
      if (lesson.lesson.trim().length === 0) {
        throw new Error(`Empty lesson name for ${location}.`);
      }
    }

    // Check a sorted copy so unordered input cannot hide overlapping lessons.
    const sorted = [...lessons].sort((a, b) => a.start.localeCompare(b.start));
    for (let index = 1; index < sorted.length; index++) {
      if (sorted[index].start < sorted[index - 1].end) {
        throw new Error(`Overlapping lessons for ${dayName}: ${sorted[index - 1].start}–${sorted[index - 1].end} and ${sorted[index].start}–${sorted[index].end}.`);
      }
    }
    validated[dayName] = sorted.map(({ start, end, lesson }) => ({ start, end, lesson: lesson.trim() }));
  }

  return validated;
}

export function getDayName(day: number): string {
  return dayNames[day] ?? "Դասացուցակ";
}
