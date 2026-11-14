import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const [tag, directory = "release-assets"] = process.argv.slice(2);
if (!tag || !/^v\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(tag)) {
  throw new Error("Usage: node scripts/create-updater-manifest.mjs vX.Y.Z [asset-directory]");
}

const files = await readdir(directory);
const releaseUrl = `https://github.com/horarium-classium/student/releases/download/${tag}`;
const platforms = {};
const installer = files.find((file) => file.endsWith("-setup.exe") && files.includes(`${file}.sig`));
if (!installer) throw new Error("Missing signed Windows NSIS installer.");
const signature = await readFile(join(directory, `${installer}.sig`), "utf8");
platforms["windows-x86_64"] = {
  url: `${releaseUrl}/${encodeURIComponent(installer)}`,
  signature: signature.trim(),
};

const manifest = {
  version: tag.slice(1),
  notes: `Horarium Classium ${tag}`,
  pub_date: new Date().toISOString(),
  platforms,
};
await writeFile(join(directory, "latest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
