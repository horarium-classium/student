import { listen } from "@tauri-apps/api/event";
import { speak, type SpeechNotification } from "./speech";
import { applySettings, settings, type Settings } from "./settings";

export async function initializeTray(): Promise<void> {
  await listen<SpeechNotification>("speak-notification", ({ payload }) => {
    speak(payload, settings.notificationsEnabled && settings.speechEnabled);
  });
  await listen<Settings>("settings-changed", ({ payload }) => {
    applySettings(payload);
  });
  await listen<string>("settings-error", ({ payload }) => {
    const status = document.querySelector<HTMLElement>("#status");
    if (status) status.textContent = `Չհաջողվեց պահպանել կարգավորումը։ ${payload}`;
  });
}
