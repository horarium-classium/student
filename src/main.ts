import { listen } from "@tauri-apps/api/event";
import { ScheduleRefresh } from "./refresh";
import { Connection, type ConnectionView } from "./connection";
import { publicationConfig, type Publication } from "./publication";
import { schoolTime, lessonProgress, lessonInterval } from "./school-time";
import { stopSpeech } from "./speech";
import { invoke } from "@tauri-apps/api/core";
import { getDayName, getScheduleDateWeekday, shiftScheduleDate } from "./schedule";
import { initializeTray } from "./tray";
import { initializeSettings } from "./settings";
import { notify } from "./notifications";

const dayNameElement = document.querySelector<HTMLElement>("#day-name");
const scheduleListElement = document.querySelector<HTMLElement>("#schedule-list");
const previousDayButton = document.querySelector<HTMLButtonElement>("#previous-day");
const nextDayButton = document.querySelector<HTMLButtonElement>("#next-day");
const copyrightYearElement = document.querySelector<HTMLElement>("#copyright-year");
const versionElement = document.querySelector<HTMLElement>("#app-version");
const notificationButton = document.querySelector<HTMLButtonElement>("#notification-test");
if (copyrightYearElement) copyrightYearElement.textContent = String(new Date().getFullYear());
if (versionElement) versionElement.textContent = __APP_VERSION__;
let publication: Publication | null = null;
let connection: Connection | null = null;
let initializingConnection: Promise<Connection> | null = null;
const getTodayLessons = (now = new Date()) => {
  if (!publication) return [];
  const lessons = publication.schedule[getDayName(schoolTime(now, publication.timezone).weekday)] ?? [];
  return lessons.filter(lesson => lessonInterval(lesson, now, publication!.timezone));
};
const timezone = () => publication?.timezone ?? "UTC";
let selectedDate: string | null = null;
let renderedDate = "";
const sourceElement = document.querySelector<HTMLElement>("#schedule-source");

const statusElement = document.querySelector<HTMLElement>("#status");

function updateScheduleTime(): void {
  const now = new Date();
  if (publication) {
    const today = schoolTime(now, timezone()).date;
    if (!selectedDate && renderedDate !== today) renderSchedule();
  }
  updateCurrentLesson(now);
}

function updateCurrentLesson(now: Date): void {
  const today = publication ? schoolTime(now, timezone()).date : "";
  const viewingToday = publication !== null && (selectedDate ?? today) === today;
  document.querySelectorAll<HTMLTableRowElement>(".schedule-table tbody tr").forEach((row) => {
    const progress = viewingToday
      ? lessonProgress({ start: row.dataset.start ?? "", end: row.dataset.end ?? "", lesson: "" }, now, timezone())
      : undefined;
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
  if (!publication || !dayNameElement || !scheduleListElement) return;

  const now = new Date();
  const today = schoolTime(now, timezone()).date;
  const date = selectedDate ?? today;
  const viewingToday = date === today;
  const weekday = getScheduleDateWeekday(date);
  const lessons = viewingToday
    ? getTodayLessons(now)
    : publication.schedule[getDayName(weekday)] ?? [];
  renderedDate = date;
  dayNameElement.textContent = getDayName(weekday);

  if (lessons.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-day";
    empty.textContent = viewingToday ? "Այսօր դասեր չկան։" : "Այս օրը դասեր չկան։";
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
  updateCurrentLesson(now);
}

function showAdjacentDay(days: number): void {
  if (!publication) return;
  const today = schoolTime(new Date(), timezone()).date;
  const nextDate = shiftScheduleDate(selectedDate ?? today, days);
  selectedDate = nextDate === today ? null : nextDate;
  renderSchedule();
}

async function testNotification(): Promise<void> {
  if (statusElement) statusElement.textContent = "Ծանուցումը ուղարկվում է…";
  try {
    await notify("Դասացուցակ", { kind: "startingSoon", body: "1 րոպեից սկսվում է «Մաթեմատիկա» դասը։" });
    if (statusElement) statusElement.textContent = "Ծանուցումը ուղարկվեց։";
  } catch (error) {
    console.error(error);
    if (statusElement) statusElement.textContent = "Չհաջողվեց ուղարկել ծանուցումը։";
  }
}

updateScheduleTime();
window.setInterval(updateScheduleTime, 15_000);

const form = document.querySelector<HTMLFormElement>("#join-form")!;
const codeInput = document.querySelector<HTMLInputElement>("#class-code")!;
const previewElement = document.querySelector<HTMLElement>("#class-preview")!;
const confirmButton = document.querySelector<HTMLButtonElement>("#join-confirm")!;
const retryButton = document.querySelector<HTMLButtonElement>("#retry")!;
const cancelButton = document.querySelector<HTMLButtonElement>("#join-cancel")!;
const classElement = document.querySelector<HTMLElement>("#class-name")!;
const classCodeButton = document.querySelector<HTMLButtonElement>("#change-class")!;
let uiRequest = 0;
let saving = false;
let refreshing = false;
const autoRefresh = new ScheduleRefresh(() => refresh(true),
  () => Boolean(connection?.selection) && form.hidden && !saving && !refreshing);
function showError(error: unknown, reveal = true): void {
  if (!publication && dayNameElement) dayNameElement.textContent = "Դասացուցակ";
  if (statusElement) statusElement.textContent = error instanceof Error ? error.message : `Չհաջողվեց բեռնել կամ պահպանել դասացուցակը։ Ստուգեք պահոցի հասանելիությունն ու ձևաչափը։ ${String(error)}`;
  retryButton.hidden = false;
  if (reveal) void invoke("show_main_window").catch(() => {});
}
function changed(view: ConnectionView): void {
  autoRefresh.reset();
  stopSpeech();
  publication = view.publication;
  if (sourceElement) {
    sourceElement.dataset.source = view.source;
    sourceElement.textContent = view.source === "cached" ? "Օգտագործվում է պահված տարբերակը։" : "";
  }
  if (statusElement) statusElement.textContent = view.message ?? "";
  retryButton.hidden = view.source === "online";
  classCodeButton.textContent = publication?.joinCode ?? connection?.selection?.joinCode ?? "Միանալ";
  classElement.textContent = publication?.className ?? "";
  if (previousDayButton) previousDayButton.hidden = !publication;
  if (nextDayButton) nextDayButton.hidden = !publication;
  if (publication) {
    renderSchedule(); updateScheduleTime();
  } else {
    if (dayNameElement) dayNameElement.textContent = "Դասացուցակ";
    scheduleListElement?.replaceChildren();
    updateScheduleTime();
  }
}
function openJoin(): void {
  if (saving) return;
  uiRequest++; connection?.cancel();
  form.hidden = false; previewElement.textContent = ""; confirmButton.hidden = true;
  if (!publication && dayNameElement) dayNameElement.textContent = "Դասացուցակ";
  cancelButton.hidden = !connection?.selection;
  codeInput.focus();
  void invoke("show_main_window").catch(() => {});
}
async function readyConnection(): Promise<Connection> {
  if (connection) return connection;
  if (!initializingConnection) {
    initializingConnection = (async () => {
      const config = publicationConfig(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
      const next = new Connection(config, {
        read: () => invoke("read_publication"),
        begin: () => invoke("begin_publication_request"),
        commit: (token, record, cached) => invoke("commit_publication", { token, record, cached }),
      }, changed);
      await next.restore();
      connection = next;
      return next;
    })();
  }
  try { return await initializingConnection; }
  finally { initializingConnection = null; }
}
async function refresh(background = false): Promise<void> {
  if (refreshing) return;
  refreshing = true;
  autoRefresh.reset();
  const request = ++uiRequest;
  if (!background && statusElement) statusElement.textContent = "Բեռնվում է…";
  try {
    const connection = await readyConnection();
    if (request !== uiRequest) return;
    if (!connection.selection) { if (statusElement) statusElement.textContent = "Մուտքագրեք Teacher-ից ստացած դասարանի կոդը։"; openJoin(); return; }
    confirmButton.hidden = true; previewElement.textContent = "";
    await connection.refresh();
  } catch (error) { if (request === uiRequest) showError(error, !background); }
  finally { refreshing = false; }
}
form.addEventListener("submit", async event => {
  event.preventDefault();
  if (saving) return;
  const request = ++uiRequest;
  if (statusElement) statusElement.textContent = "";
  confirmButton.hidden = true; previewElement.textContent = "Ստուգվում է…";
  try {
    const connection = await readyConnection();
    if (request !== uiRequest) return;
    const candidate = await connection.preview(codeInput.value);
    if (request !== uiRequest || !candidate) return;
    previewElement.textContent = `${candidate.schoolName} · ${candidate.className}`;
    confirmButton.hidden = false;
  } catch (error) { if (request === uiRequest) { previewElement.textContent = ""; showError(error); } }
});
codeInput.addEventListener("input", () => { if (!saving) { uiRequest++; connection?.cancel(); confirmButton.hidden = true; previewElement.textContent = ""; } });
confirmButton.addEventListener("click", async () => {
  if (!connection || saving) return;
  saving = true; form.inert = true;
  try { if (await connection.confirm()) form.hidden = true; }
  catch (error) { showError(new Error(`Չհաջողվեց պահպանել միացումը։ ${String(error)}`)); }
  finally { saving = false; form.inert = false; }
});
cancelButton.addEventListener("click", () => { uiRequest++; connection?.cancel(); form.hidden = true; });
document.querySelector("#change-class")?.addEventListener("click", openJoin);
previousDayButton?.addEventListener("click", () => showAdjacentDay(-1));
nextDayButton?.addEventListener("click", () => showAdjacentDay(1));
retryButton.addEventListener("click", () => { if (!saving) void refresh(); });
void listen("schedule-refresh-tick", () => { void autoRefresh.tick(); })
  .catch(error => console.error("Schedule refresh listener:", error));
void initializeTray()
  .catch((error) => console.error("Tray listeners:", error))
  .then(initializeSettings)
  .then(() => refresh());
notificationButton?.addEventListener("click", () => void testNotification());
