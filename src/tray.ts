import { listen } from "@tauri-apps/api/event";
import { speak } from "./speech";
import { applySettings, renderSettings, settings, type Settings } from "./settings";

function openSettings(): void {
  const panel = document.querySelector<HTMLDialogElement>("#settings-panel");
  if (panel && !panel.open) panel.showModal();
}

export async function initializeTray(refresh: () => Promise<void>): Promise<void> {
  await listen<string>("speak-notification", ({ payload }) => {
    speak(payload, settings.notificationsEnabled && settings.speechEnabled);
  });
  await listen("refresh-schedule", () => void refresh());
  await listen("open-settings", openSettings);
  await listen<Settings>("settings-changed", ({ payload }) => {
    applySettings(payload);
    renderSettings();
  });
  await listen<string>("settings-error", ({ payload }) => {
    openSettings();
    const status = document.querySelector<HTMLElement>("#settings-status");
    if (status) status.textContent = `Չհաջողվեց պահպանել կարգավորումը։ ${payload}`;
  });
}
