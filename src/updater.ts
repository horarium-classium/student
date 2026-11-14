import { invoke } from "@tauri-apps/api/core";
import { check } from "@tauri-apps/plugin-updater";

const status = document.querySelector<HTMLElement>("#update-status");

function setStatus(message: string): void {
  if (status) status.textContent = message;
}

async function checkAndInstallUpdate(): Promise<void> {
  try {
    if (!(await invoke<boolean>("updater_supported"))) return;

    setStatus("Ստուգվում է նոր տարբերակի առկայությունը…");
    const update = await check();
    if (!update) {
      setStatus("Օգտագործվում է ծրագրի վերջին տարբերակը։");
      return;
    }

    setStatus(`Հասանելի է ${update.version} տարբերակը․ թարմացումը ներբեռնվում է…`);
    let downloaded = 0;
    let total: number | undefined;
    await update.downloadAndInstall((event) => {
      if (event.event === "Started") {
        total = event.data.contentLength;
        downloaded = 0;
      } else if (event.event === "Progress") {
        downloaded += event.data.chunkLength;
        const progress = total ? ` ${Math.floor((downloaded / total) * 100)}%` : "";
        setStatus(`Ներբեռնվում և տեղադրվում է ${update.version} տարբերակը…${progress}`);
      } else if (event.event === "Finished") {
        setStatus("Թարմացումը տեղադրվեց․ ծրագիրը վերագործարկվում է…");
      }
    });
    await invoke("restart_after_update");
  } catch (error) {
    console.error("Automatic update failed:", error);
    setStatus("Չհաջողվեց ստուգել կամ տեղադրել թարմացումը։ Հաջորդ գործարկման ժամանակ կփորձենք կրկին։");
  }
}

window.setTimeout(() => void checkAndInstallUpdate(), 5_000);
