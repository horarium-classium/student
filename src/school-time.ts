import type { Lesson } from "./types";

const formatters = new Map<string, Intl.DateTimeFormat>();
export function schoolTime(now: Date, timezone: string) {
  let formatter = formatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
    formatters.set(timezone, formatter);
  }
  const parts = Object.fromEntries(formatter.formatToParts(now).map(p => [p.type, p.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay() || 7;
  return { date, weekday, time: `${parts.hour}:${parts.minute}`, second: Number(parts.second) };
}
// DST policy shared with Rust: skip nonexistent endpoints; use the earlier instant
// for repeated wall times. Compare actual instants, so the repeated hour cannot replay a lesson.
const instants = new Map<string, number | undefined>();
export function schoolInstant(date: string, time: string, timezone: string): number | undefined {
  const key = `${timezone}/${date}/${time}`;
  if (instants.has(key)) return instants.get(key);
  const wall = Date.parse(`${date}T${time}:00Z`);
  const candidates = new Set<number>();
  for (let hours = -36; hours <= 36; hours += 6) {
    const sample = wall + hours * 3_600_000;
    const local = schoolTime(new Date(sample), timezone);
    const offset = Date.parse(`${local.date}T${local.time}:${String(local.second).padStart(2, "0")}Z`) - sample;
    const candidate = wall - offset;
    const actual = schoolTime(new Date(candidate), timezone);
    if (actual.date === date && actual.time === time && actual.second === 0) candidates.add(candidate);
  }
  const result = candidates.size ? Math.min(...candidates) : undefined;
  if (instants.size > 1000) instants.clear();
  instants.set(key, result);
  return result;
}
export function lessonInterval(lesson: Lesson, now: Date, timezone: string): { start: number; end: number } | undefined {
  const { date } = schoolTime(now, timezone);
  const start = schoolInstant(date, lesson.start, timezone), end = schoolInstant(date, lesson.end, timezone);
  return start !== undefined && end !== undefined && start < end ? { start, end } : undefined;
}
export function lessonProgress(lesson: Lesson, now: Date, timezone: string): number | undefined {
  const interval = lessonInterval(lesson, now, timezone);
  return interval && +now >= interval.start && +now < interval.end ? (+now - interval.start) / (interval.end - interval.start) * 100 : undefined;
}
export function schoolSummary(lessons: Lesson[], now: Date, timezone: string): string {
  const valid = lessons.map(lesson => ({ lesson, interval: lessonInterval(lesson, now, timezone) })).filter(item => item.interval);
  if (!valid.length) return "Այսօր դասեր չկան։";
  const current = valid.find(({ interval }) => +now >= interval!.start && +now < interval!.end);
  if (current) return `Հիմա՝ ${current.lesson.lesson} · մինչև ${current.lesson.end}`;
  const next = valid.filter(({ interval }) => interval!.start > +now).sort((a, b) => a.interval!.start - b.interval!.start)[0];
  return next ? `Հաջորդ դասը՝ ${next.lesson.lesson} — ${next.lesson.start}` : "";
}
