import { listen } from "@tauri-apps/api/event";
import { speak } from "./speech";
import { applySettings, renderSettings, settings, type Settings } from "./settings";

export async function initializeTray(refresh: () => Promise<void>): Promise<void> {
  await listen<string>("speak-notification", ({ payload }) => {
    speak(payload, settings.notificationsEnabled && settings.speechEnabled);
  });
  await listen("refresh-schedule", () => void refresh());
  await listen("open-settings", () => {
    const panel = document.querySelector<HTMLDetailsElement>("#settings-panel");
    if (panel) {
      panel.open = true;
      panel.scrollIntoView({ behavior: "smooth" });
      panel.querySelector("summary")?.focus();
    }
  });
  await listen<Settings>("settings-changed", ({ payload }) => {
    applySettings(payload);
    renderSettings();
  });
  await listen<string>("settings-error", ({ payload }) => {
    const panel = document.querySelector<HTMLDetailsElement>("#settings-panel");
    if (panel) panel.open = true;
    const status = document.querySelector<HTMLElement>("#settings-status");
    if (status) status.textContent = `Չհաջողվեց պահպանել կարգավորումը։ ${payload}`;
  });
}
