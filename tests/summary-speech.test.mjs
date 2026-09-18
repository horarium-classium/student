import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

async function load(name) {
  const source = await readFile(new URL(`../src/${name}.ts`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}

test("summary handles empty, upcoming, current, adjacent and finished lessons", async () => {
  const { lessonSummary } = await load("summary");
  const lessons = [
    { start: "09:00", end: "10:00", lesson: "Մաթեմատիկա" },
    { start: "10:00", end: "11:00", lesson: "Ֆիզիկա" },
  ];
  const at = (hour, minute = 0) => new Date(2026, 8, 21, hour, minute);
  assert.equal(lessonSummary([], at(8)), "Այսօր դասեր չկան։");
  assert.equal(lessonSummary([...lessons].reverse(), at(8)), "Հաջորդ դասը՝ Մաթեմատիկա — 09:00");
  assert.equal(lessonSummary(lessons, at(9)), "Հիմա՝ Մաթեմատիկա · մինչև 10:00");
  assert.equal(lessonSummary(lessons, at(10)), "Հիմա՝ Ֆիզիկա · մինչև 11:00");
  assert.equal(lessonSummary(lessons, at(11)), "Այսօրվա դասերն ավարտվել են։");
});

test("speech is optional and safe without an Armenian voice or browser support", async (t) => {
  const { speak, stopSpeech, hasArmenianVoice } = await load("speech");
  const oldWindow = globalThis.window;
  const oldUtterance = globalThis.SpeechSynthesisUtterance;
  t.after(() => {
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
    if (oldUtterance === undefined) delete globalThis.SpeechSynthesisUtterance; else globalThis.SpeechSynthesisUtterance = oldUtterance;
  });
  globalThis.window = {};
  assert.equal(speak("Դաս", true), false);
  assert.doesNotThrow(stopSpeech);
  let voices = [{ lang: "en-US" }];
  const spoken = [];
  let cancelled = 0;
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  window.speechSynthesis = {
    getVoices: () => voices,
    cancel: () => { cancelled++; },
    speak: (utterance) => spoken.push(utterance),
  };
  assert.equal(hasArmenianVoice(), false);
  assert.equal(speak("Դաս", true), false);
  voices = [{ lang: "hy-AM" }];
  assert.equal(hasArmenianVoice(), true);
  assert.equal(speak("Դաս", false), false);
  assert.equal(spoken.length, 0);
  assert.equal(speak("1 րոպեից սկսվում է դասը", true), true);
  assert.equal(spoken[0].text, "Մեկ րոպեից սկսվում է դասը");
  assert.equal(spoken[0].lang, "hy-AM");
  assert.equal(cancelled, 1);
  window.speechSynthesis.speak = () => { throw new Error("unsupported"); };
  assert.equal(speak("Դաս", true), false);
});
