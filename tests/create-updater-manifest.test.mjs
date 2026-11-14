import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import { join } from "node:path";
import { test } from "node:test";

test("creates the updater manifest from the signed NSIS installer", async () => {
  const directory = await mkdtemp(join(os.tmpdir(), "horarium-updater-"));
  const installer = "Horarium Classium_0.9.1_x64-setup.exe";
  try {
    await writeFile(join(directory, installer), "installer");
    await writeFile(join(directory, `${installer}.sig`), "signature\n");
    execFileSync(process.execPath, [
      "scripts/create-updater-manifest.mjs",
      "v0.9.1",
      directory,
    ]);

    const manifest = JSON.parse(await readFile(join(directory, "latest.json"), "utf8"));
    assert.equal(manifest.version, "0.9.1");
    assert.deepEqual(manifest.platforms["windows-x86_64"], {
      url: "https://github.com/horarium-classium/student/releases/download/v0.9.1/Horarium%20Classium_0.9.1_x64-setup.exe",
      signature: "signature",
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
