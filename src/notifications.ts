import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

export async function notify(title: string, body: string): Promise<void> {
  let permissionGranted = await isPermissionGranted();
  if (!permissionGranted) {
    permissionGranted = (await requestPermission()) === "granted";
  }

  if (!permissionGranted) throw new Error("Notification permission was not granted.");
  sendNotification({ title, body });
}