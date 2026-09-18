import { lessonSummary } from "./summary";
import { invoke } from "@tauri-apps/api/core";
import { getDayName, getTodayLessons, loadSchedules, schedule } from "./schedule";
import { initializeTray } from "./tray";
import { initializeSettings } from "./settings";
import { notify } from "./notifications";

const dayNameElement = document.querySelector<HTMLElement>("#day-name");
const scheduleListElement = document.querySelector<HTMLElement>("#schedule-list");
const currentTimeElement = document.querySelector<HTMLTimeElement>("#current-time");
const notificationButton = document.querySelector<HTMLButtonElement>("#notification-test");
const refreshButton = document.querySelector<HTMLButtonElement>("#refresh");
let loading = false;
let hasSchedule = false;
let renderedDay = "";
const summaryElement = document.querySelector<HTMLElement>("#lesson-summary");
const sourceElement = document.querySelector<HTMLElement>("#schedule-source");

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
  if (hasSchedule) {
    if (renderedDay !== now.toDateString()) renderSchedule();
    if (summaryElement) summaryElement.textContent = lessonSummary(getTodayLessons(now), now);
  }
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
  renderedDay = today.toDateString();
  if (summaryElement) {
    summaryElement.hidden = lessons.length === 0;
    summaryElement.textContent = lessonSummary(lessons, today);
  }
  dayNameElement.textContent = getDayName(today.getDay() === 0 ? 7 : today.getDay());

  if (lessons.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-day";
    empty.textContent = "Այսօր դասեր չկան։";
    scheduleListElement.replaceChildren(empty);
    return;
  }
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
window.setInterval(updateCurrentTime, 15_000);

export async function refreshSchedule(): Promise<void> {
  if (loading) return;
  loading = true;
  if (refreshButton) refreshButton.disabled = true;
  if (statusElement) statusElement.textContent = "Բեռնվում է…";
  try {
    const result = await loadSchedules(!hasSchedule);
    hasSchedule = true;
    renderSchedule();
    if (sourceElement) {
      sourceElement.dataset.source = result.source;
      sourceElement.textContent = result.source === "cached" ? "Աղբյուր՝ պահված տարբերակ" :
        `Աղբյուր՝ առցանց · Թարմացված է՝ ${new Date(result.updatedAt!).toLocaleTimeString("hy-AM", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
    }
    try {
      await invoke("update_schedule", { schedule });
      if (statusElement) statusElement.textContent = result.warning ?? "";
    } catch (error) {
      if (statusElement) statusElement.textContent = `Դասացուցակը ցուցադրված է, բայց հիշեցումները չեն թարմացվել։ ${String(error)}`;
    }
  } catch (error) {
    if (!hasSchedule) {
      showScheduleError(error);
      if (sourceElement) {
        sourceElement.dataset.source = "error";
        sourceElement.textContent = "Աղբյուր՝ սխալ";
      }
    }
    if (statusElement) statusElement.textContent = `${hasSchedule ? "Թարմացումը չհաջողվեց։ Գործող դասացուցակը պահպանված է։" : "Դասացուցակը հասանելի չէ։ Ստուգեք կապը և կրկին փորձեք։"} ${String(error)}`;
  } finally {
    loading = false;
    if (refreshButton) refreshButton.disabled = false;
  }
}

void initializeTray(refreshSchedule)
  .catch((error) => console.error("Tray listeners:", error))
  .then(initializeSettings)
  .then(refreshSchedule);
refreshButton?.addEventListener("click", () => void refreshSchedule());
notificationButton?.addEventListener("click", () => void testNotification());
