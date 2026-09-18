import { getDayName, getTodayLessons, loadSchedules } from "./schedule";
import { notify } from "./notifications";
import { createScheduler } from "./scheduler";

const scheduler = createScheduler(() => getTodayLessons());

const dayNameElement = document.querySelector<HTMLElement>("#day-name");
const scheduleListElement = document.querySelector<HTMLElement>("#schedule-list");
const currentTimeElement = document.querySelector<HTMLTimeElement>("#current-time");
const notificationButton = document.querySelector<HTMLButtonElement>("#notification-test");
const statusElement = document.querySelector<HTMLElement>("#status");

function updateCurrentTime(): void {
  if (!currentTimeElement) return;

  const now = new Date();
  currentTimeElement.dateTime = now.toISOString();
  currentTimeElement.textContent = now.toLocaleTimeString("hy-AM", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  updateCurrentLesson(now);
}

function parseScheduleTime(time: string, date: Date): Date | undefined {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return undefined;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return undefined;

  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

function getLessonProgress(startText: string, endText: string, now: Date): number | undefined {
  const start = parseScheduleTime(startText, now);
  const end = parseScheduleTime(endText, now);
  if (start === undefined || end === undefined || now < start || now >= end) return undefined;

  const duration = end.getTime() - start.getTime();
  const elapsed = now.getTime() - start.getTime();
  return Math.min(100, Math.max(0, (elapsed / duration) * 100));
}

function updateCurrentLesson(now: Date): void {
  document.querySelectorAll<HTMLTableRowElement>(".schedule-table tbody tr").forEach((row) => {
    const progress = getLessonProgress(row.dataset.start ?? "", row.dataset.end ?? "", now);
    const isCurrent = progress !== undefined;
    row.classList.toggle("current-lesson", isCurrent);
    row.setAttribute("aria-current", isCurrent ? "time" : "false");
    if (progress === undefined) {
      row.style.removeProperty("--lesson-progress");
    } else {
      row.style.setProperty("--lesson-progress", `${progress}%`);
    }
  });
}

function renderSchedule(): void {
  if (!dayNameElement || !scheduleListElement) return;

  const today = new Date();
  const lessons = getTodayLessons(today);
  dayNameElement.textContent = getDayName(today.getDay() === 0 ? 7 : today.getDay());

  const table = document.createElement("table");
  table.className = "schedule-table";
  table.innerHTML = "<thead><tr><th scope=\"col\">Ժամը</th><th scope=\"col\">Դաս</th></tr></thead>";

  const body = document.createElement("tbody");
  for (const lesson of lessons) {
    const row = document.createElement("tr");
    row.dataset.start = lesson.start;
    row.dataset.end = lesson.end;
    const time = document.createElement("td");
    const subject = document.createElement("td");
    time.textContent = `${lesson.start}–${lesson.end}`;
    subject.textContent = lesson.lesson;
    const currentLabel = document.createElement("span");
    currentLabel.className = "current-lesson-label";
    currentLabel.textContent = "Հիմա";
    subject.append(currentLabel);
    row.append(time, subject);
    body.append(row);
  }

  table.append(body);
  scheduleListElement.replaceChildren(table);
  updateCurrentLesson(today);
}

function showScheduleError(error: unknown): void {
  console.error(error);
  if (dayNameElement) dayNameElement.textContent = "Դասացուցակ";
  if (scheduleListElement) {
    scheduleListElement.textContent = "Չհաջողվեց բեռնել դասացուցակը։";
  }
}

async function testNotification(): Promise<void> {
  if (statusElement) statusElement.textContent = "Ծանուցումը ուղարկվում է…";
  try {
    await notify("Դասացուցակ", "1 րոպեից սկսվում է «Մաթեմատիկա» դասը։");
    if (statusElement) statusElement.textContent = "Ծանուցումը ուղարկվեց։";
  } catch (error) {
    console.error(error);
    if (statusElement) statusElement.textContent = "Չհաջողվեց ուղարկել ծանուցումը։";
  }
}

updateCurrentTime();
window.setInterval(updateCurrentTime, 60_000);

void loadSchedules()
  .then(() => {
    renderSchedule();
    scheduler.start();
  })
  .catch(showScheduleError);
notificationButton?.addEventListener("click", () => void testNotification());
