import type { Lesson } from "./types";

export function lessonSummary(lessons: Lesson[], now = new Date()): string {
  if (lessons.length === 0) return "Այսօր դասեր չկան։";
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const current = lessons.find((lesson) => lesson.start <= time && time < lesson.end);
  if (current) return `Հիմա՝ ${current.lesson} · մինչև ${current.end}`;
  const next = lessons.filter((lesson) => lesson.start > time).sort((a, b) => a.start.localeCompare(b.start))[0];
  if (next) return `Հաջորդ դասը՝ ${next.lesson} — ${next.start}`;
  return "";
}
