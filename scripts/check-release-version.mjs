import { readFileSync } from 'node:fs';

const tag = process.argv[2];

if (!tag || !/^v\d+\.\d+\.\d+$/.test(tag)) {
  console.error('Expected a release tag in the form v1.2.3.');
  process.exit(1);
}

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const tauriConfig = JSON.parse(
  readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
);
const cargoToml = readFileSync(new URL('../src-tauri/Cargo.toml', import.meta.url), 'utf8');
const cargoVersion = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const expectedVersion = tag.slice(1);

if (
  packageJson.version !== expectedVersion ||
  tauriConfig.version !== expectedVersion ||
  cargoVersion !== expectedVersion
) {
  console.error(
    `Release ${tag} does not match package.json (${packageJson.version}), ` +
      `tauri.conf.json (${tauriConfig.version}), and Cargo.toml (${cargoVersion ?? 'missing'}).`,
  );
  process.exit(1);
}

console.log(`Release versions match: ${expectedVersion}`);
