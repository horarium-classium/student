import type { Lesson, Schedule } from "./types";

export const scheduleUrl = "https://gist.githubusercontent.com/armenbadal/d384e13e190a1d6ff9fb9a1f89205ae0/raw/horarium-classium.json";

export const dayNames: Record<number, string> = {
  1: "Երկուշաբթի",
  2: "Երեքշաբթի",
  3: "Չորեքշաբթի",
  4: "Հինգշաբթի",
  5: "Ուրբաթ",
  6: "Շաբաթ",
  7: "Կիրակի",
};

export let schedule: Schedule = {};

function isLesson(value: unknown): value is Lesson {
  if (typeof value !== "object" || value === null) return false;
  const lesson = value as Record<string, unknown>;
  return (
    typeof lesson.start === "string" &&
    typeof lesson.end === "string" &&
    typeof lesson.lesson === "string"
  );
}

function validateSchedule(value: unknown): Schedule {
  if (typeof value !== "object" || value === null) {
    throw new Error("Gist schedule must be a JSON object.");
  }

  const remoteSchedule = value as Record<string, unknown>;
  for (const [dayName, lessons] of Object.entries(remoteSchedule)) {
    if (!Array.isArray(lessons) || !lessons.every(isLesson)) {
      throw new Error(`Invalid schedule data for ${dayName}.`);
    }
  }

  return remoteSchedule as Schedule;
}

export async function loadSchedules(): Promise<void> {
  const response = await fetch(scheduleUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load schedule: HTTP ${response.status}.`);
  }

  schedule = validateSchedule(await response.json());
}

export function getDayName(day: number): string {
  return dayNames[day] ?? "Դասացուցակ";
}

export function getTodayLessons(date = new Date()): Lesson[] {
  return schedule[getDayName(date.getDay() === 0 ? 7 : date.getDay())] ?? [];
}