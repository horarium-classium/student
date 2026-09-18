import type { Lesson } from "./types";
import { notify } from "./notifications";
import { playBell } from "./audio";

export function getLessonsForDay(lessons: Lesson[]): Lesson[] {
  return lessons;
}

function timeToDate(time: string, date: Date): Date | undefined {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return undefined;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return undefined;

  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

export function findNextLesson(lessons: Lesson[], now = new Date()): Lesson | undefined {
  return lessons
    .filter((lesson) => {
      const start = timeToDate(lesson.start, now);
      return start !== undefined && start > now;
    })
    .sort((first, second) => first.start.localeCompare(second.start))[0];
}

function eventKey(now: Date, lesson: Lesson, event: string): string {
  return `${now.toISOString().slice(0, 10)}:${event}:${lesson.start}:${lesson.lesson}`;
}

export interface Scheduler {
  checkNow(now?: Date): Promise<void>;
  start(): void;
  stop(): void;
}

export function createScheduler(getLessons: () => Lesson[], intervalMs = 30_000): Scheduler {
  const notifiedEvents = new Set<string>();
  let timer: ReturnType<typeof setInterval> | undefined;

  async function checkNow(now = new Date()): Promise<void> {
    const lessons = getLessons();

    for (const lesson of lessons) {
      const start = timeToDate(lesson.start, now);
      const end = timeToDate(lesson.end, now);
      if (!start || !end) continue;

      const startKey = eventKey(now, lesson, "start");
      if (now >= new Date(start.getTime() - 60_000) && now < start && !notifiedEvents.has(startKey)) {
        notifiedEvents.add(startKey);
        await notify("Դասացուցակ", `1 րոպեից սկսվում է «${lesson.lesson}» դասը։`);
        await playBell();
      }

      const endKey = eventKey(now, lesson, "end");
      if (now >= end && now < new Date(end.getTime() + 60_000) && !notifiedEvents.has(endKey)) {
        notifiedEvents.add(endKey);
        const nextLesson = findNextLesson(lessons, end);
        const nextText = nextLesson ? ` Հաջորդը՝ «${nextLesson.lesson}»։` : " Այլ դաս այսօր չկա։";
        await notify("Դասացուցակ", `«${lesson.lesson}» դասը ավարտվեց։${nextText}`);
      }
    }
  }

  return {
    checkNow,
    start(): void {
      if (timer !== undefined) return;
      void checkNow();
      timer = setInterval(() => void checkNow(), intervalMs);
    },
    stop(): void {
      if (timer === undefined) return;
      clearInterval(timer);
      timer = undefined;
    },
  };
}