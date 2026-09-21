import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { speak, type SpeechNotification } from "./speech";
import { settings } from "./settings";
import { playBell } from "./audio";

export async function notify(title: string, message: SpeechNotification): Promise<void> {
  const { body } = message;
  if (!settings.notificationsEnabled) return;
  let permissionGranted = await isPermissionGranted();
  if (!permissionGranted) {
    permissionGranted = (await requestPermission()) === "granted";
  }

  if (!permissionGranted) throw new Error("Notification permission was not granted.");
  sendNotification({ title, body });
  speak(message, settings.speechEnabled);
  // A missing audio device must not turn a delivered notification into a failure.
  await playBell().catch((error) => console.error("Could not play bell:", error));
}
