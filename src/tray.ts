import { listen } from "@tauri-apps/api/event";
import { stopSpeech, speak, type SpeechNotification } from "./speech";
import { applySettings, settings, type Settings } from "./settings";

export async function initializeTray(): Promise<void> {
  let source = "";
  await listen<string>("publication-source-changed", ({ payload }) => { source = payload; stopSpeech(); });
  await listen<SpeechNotification & { source: string }>("speak-notification", ({ payload }) => {
    if (payload.source === source) speak(payload, settings.notificationsEnabled && settings.speechEnabled);
  });
  await listen<Settings>("settings-changed", ({ payload }) => {
    applySettings(payload);
  });
  await listen<string>("settings-error", ({ payload }) => {
    const status = document.querySelector<HTMLElement>("#status");
    if (status) status.textContent = `Չհաջողվեց պահպանել կարգավորումը։ ${payload}`;
  });
}
