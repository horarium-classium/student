import { stopSpeech } from "./speech";
import { invoke } from "@tauri-apps/api/core";

export interface Settings {
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  speechEnabled: boolean;
}

export let settings: Settings = {
  notificationsEnabled: true,
  soundEnabled: true,
  speechEnabled: false,
};

export function applySettings(value: Settings): void {
  settings = value;
  if (!settings.speechEnabled || !settings.notificationsEnabled) stopSpeech();
}

export async function loadSettings(): Promise<Settings> {
  applySettings(await invoke<Settings>("get_settings"));
  return settings;
}

export async function initializeSettings(): Promise<void> {
  try {
    await loadSettings();
  } catch (error) {
    const status = document.querySelector<HTMLElement>("#settings-status");
    if (status) status.textContent = `Չհաջողվեց բեռնել կարգավորումները։ ${String(error)}`;
  }
}
