import { invoke } from "@tauri-apps/api/core";

export async function playBell(): Promise<void> {
  await invoke("play_bell");
}
