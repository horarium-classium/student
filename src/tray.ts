import { listen } from "@tauri-apps/api/event";
import { speak } from "./speech";
import { applySettings, settings, type Settings } from "./settings";

export async function initializeTray(refresh: () => Promise<void>): Promise<void> {
  await listen<string>("speak-notification", ({ payload }) => {
    speak(payload, settings.notificationsEnabled && settings.speechEnabled);
  });
  await listen("refresh-schedule", () => void refresh());
  await listen<Settings>("settings-changed", ({ payload }) => {
    applySettings(payload);
  });
  await listen<string>("settings-error", ({ payload }) => {
    const status = document.querySelector<HTMLElement>("#status");
    if (status) status.textContent = `Չհաջողվեց պահպանել կարգավորումը։ ${payload}`;
  });
}
