import { hasArmenianVoice, stopSpeech } from "./speech";
import { playBell } from "./audio";
import { invoke } from "@tauri-apps/api/core";

export interface Settings {
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  speechEnabled: boolean;
  autostartEnabled: boolean;
  startMinimized: boolean;
}

export let settings: Settings = {
  notificationsEnabled: true,
  soundEnabled: true,
  speechEnabled: false,
  autostartEnabled: false,
  startMinimized: false,
};

export function applySettings(value: Settings): void {
  settings = value;
  if (!settings.speechEnabled || !settings.notificationsEnabled) stopSpeech();
}

export async function loadSettings(): Promise<Settings> {
  applySettings(await invoke<Settings>("get_settings"));
  return settings;
}

export async function setSetting(key: keyof Settings, enabled: boolean): Promise<Settings> {
  applySettings(await invoke<Settings>("set_setting", { key, enabled }));
  return settings;
}

export function renderSettings(): void {
  const hint = document.querySelector<HTMLElement>("#speech-hint");
  if (hint) hint.textContent = settings.speechEnabled && !hasArmenianVoice()
    ? "Հայերեն ձայնը հասանելի չէ։ Խոսքը չի նվագարկվի։" : "";
  document.querySelectorAll<HTMLInputElement>("#settings-fields input").forEach((input) => {
    input.checked = settings[input.name as keyof Settings];
  });
}

export async function initializeSettings(): Promise<void> {
  window.speechSynthesis?.addEventListener("voiceschanged", renderSettings);
  const fields = document.querySelector<HTMLFieldSetElement>("#settings-fields");
  const status = document.querySelector<HTMLElement>("#settings-status");
  if (!fields || !status) return;
  try {
    await loadSettings();
    renderSettings();
    fields.disabled = false;
  } catch (error) {
    status.textContent = `Չհաջողվեց բեռնել կարգավորումները։ ${String(error)}`;
  }
  document.querySelector("#bell-test")?.addEventListener("click", () => {
    if (!settings.notificationsEnabled || !settings.soundEnabled) {
      status.textContent = "Զանգի համար միացրեք ծանուցումներն ու ձայնը։";
      return;
    }
    void playBell().catch((error) => { status.textContent = `Չհաջողվեց նվագարկել զանգը։ ${String(error)}`; });
  });
  fields.addEventListener("change", async (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    fields.disabled = true;
    try {
      await setSetting(input.name as keyof Settings, input.checked);
      status.textContent = "Կարգավորումը պահպանված է։";
    } catch (error) {
      status.textContent = `Չհաջողվեց պահպանել կարգավորումը։ ${String(error)}`;
      await loadSettings().catch(() => undefined);
    } finally {
      renderSettings();
      fields.disabled = false;
    }
  });
}
