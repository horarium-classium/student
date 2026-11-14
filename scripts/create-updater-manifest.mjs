import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const [tag, directory = "release-assets"] = process.argv.slice(2);
if (!tag || !/^v\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(tag)) {
  throw new Error("Usage: node scripts/create-updater-manifest.mjs vX.Y.Z [asset-directory]");
}

const files = await readdir(directory);
const releaseUrl = `https://github.com/horarium-classium/student/releases/download/${tag}`;
const platforms = {};
const archive = files.find((file) => file.endsWith("-setup.nsis.zip"));
if (!archive) throw new Error("Missing signed Windows NSIS updater archive.");
const signature = await readFile(join(directory, `${archive}.sig`), "utf8");
platforms["windows-x86_64"] = {
  url: `${releaseUrl}/${encodeURIComponent(archive)}`,
  signature: signature.trim(),
};

const manifest = {
  version: tag.slice(1),
  notes: `Horarium Classium ${tag}`,
  pub_date: new Date().toISOString(),
  platforms,
};
await writeFile(join(directory, "latest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
