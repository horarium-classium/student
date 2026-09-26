import { readFile } from "node:fs/promises";
import ts from "typescript";
export async function load(name) {
  const source = await readFile(new URL(`../src/${name}.ts`, import.meta.url), "utf8");
  let { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
  for (const match of [...outputText.matchAll(/from "\.\/([\w-]+)"/g)]) {
    outputText = outputText.replace(match[0], `from "${await moduleUrl(match[1])}"`);
  }
  return `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
}
const moduleUrl = load;
