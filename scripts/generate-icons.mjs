// Regenerate desktop icon formats using the project's existing Tauri CLI.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const cli = join(root, "node_modules/@tauri-apps/cli/tauri.js");
const icons = join(root, "src-tauri/icons");
const temporary = mkdtempSync(join(tmpdir(), "horarium-icons-"));
const generate = (source, output, size) => execFileSync(process.execPath, [
  cli, "icon", join(root, "src/assets", source), "--output", output,
  ...(size ? ["--png", String(size)] : []),
], { cwd: root, stdio: "inherit" });

try {
  mkdirSync(icons, { recursive: true });
  const desktop = join(temporary, "desktop");
  generate("horarium.svg", desktop);
  // Tauri also produces mobile subdirectories; this project ships desktop icons.
  for (const entry of readdirSync(desktop, { withFileTypes: true })) {
    if (entry.isFile()) copyFileSync(join(desktop, entry.name), join(icons, entry.name));
  }
  for (const [source, name, size] of [
    ["tray.svg", "tray.png", 64],
    ["tray-template.svg", "tray-template.png", 44],
  ]) {
    const output = join(temporary, name);
    generate(source, output, size);
    copyFileSync(join(output, `${size}x${size}.png`), join(icons, name));
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
