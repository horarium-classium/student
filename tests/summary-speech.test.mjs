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
  const { schoolSummary } = await load("school-time");
  const lessonSummary = (lessons, now) => schoolSummary(lessons, now, "UTC");
  const lessons = [
    { start: "09:00", end: "10:00", lesson: "Մաթեմատիկա" },
    { start: "10:00", end: "11:00", lesson: "Ֆիզիկա" },
  ];
  const at = (hour, minute = 0) => new Date(Date.UTC(2026, 8, 21, hour, minute));
  assert.equal(lessonSummary([], at(8)), "Այսօր դասեր չկան։");
  assert.equal(lessonSummary([...lessons].reverse(), at(8)), "Հաջորդ դասը՝ Մաթեմատիկա — 09:00");
  assert.equal(lessonSummary(lessons, at(9)), "Հիմա՝ Մաթեմատիկա · մինչև 10:00");
  assert.equal(lessonSummary(lessons, at(10)), "Հիմա՝ Ֆիզիկա · մինչև 11:00");
  assert.equal(lessonSummary(lessons, at(11)), "");
});

test("speech prefers Armenian, falls back to English and handles delayed voices", async (t) => {
  const { speak, stopSpeech } = await load("speech");
  const oldWindow = globalThis.window;
  const oldUtterance = globalThis.SpeechSynthesisUtterance;
  t.after(() => {
    stopSpeech();
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
    if (oldUtterance === undefined) delete globalThis.SpeechSynthesisUtterance; else globalThis.SpeechSynthesisUtterance = oldUtterance;
  });
  const message = { kind: "startingSoon", body: "1 րոպեից սկսվում է «Մաթեմատիկա» դասը։" };
  globalThis.window = {};
  assert.equal(speak(message, true), false);
  assert.doesNotThrow(stopSpeech);
  let voices = [{ lang: "en-GB" }, { lang: "en-US" }];
  const spoken = [];
  const events = new EventTarget();
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  window.speechSynthesis = {
    getVoices: () => voices,
    cancel: () => {},
    speak: (utterance) => spoken.push(utterance),
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  };
  assert.equal(speak(message, false), false);
  assert.equal(spoken.length, 0);
  assert.equal(speak(message, true), true);
  assert.equal(spoken.at(-1).text, "Your next lesson starts in one minute.");
  assert.equal(spoken.at(-1).lang, "en-US");
  for (const [kind, text] of [["started", "Your lesson has already started."], ["ended", "Your lesson has ended."]]) {
    speak({ ...message, kind }, true);
    assert.equal(spoken.at(-1).text, text);
  }
  voices.push({ lang: "hy-AM" });
  speak(message, true);
  assert.equal(spoken.at(-1).lang, "hy-AM");
  assert.equal(spoken.at(-1).text, message.body.replace("1", "Մեկ"));
  voices = [{ lang: "fr-FR" }];
  const count = spoken.length;
  assert.equal(speak(message, true), false);
  assert.equal(spoken.length, count);
  voices = [{ lang: "en-GB" }];
  events.dispatchEvent(new Event("voiceschanged"));
  assert.equal(spoken.length, count + 1);
  events.dispatchEvent(new Event("voiceschanged"));
  assert.equal(spoken.length, count + 1);
  voices = [];
  speak(message, true);
  speak({ kind: "ended", body: "Դասն ավարտվեց։" }, true);
  voices = [{ lang: "en-US" }];
  events.dispatchEvent(new Event("voiceschanged"));
  assert.equal(spoken.length, count + 2);
  assert.equal(spoken.at(-1).text, "Your lesson has ended.");
  t.mock.timers.enable({ apis: ["setTimeout"] });
  voices = [];
  speak(message, true);
  t.mock.timers.tick(5000);
  voices = [{ lang: "en-US" }];
  events.dispatchEvent(new Event("voiceschanged"));
  assert.equal(spoken.length, count + 2);
  voices = [];
  speak(message, true);
  stopSpeech();
  voices = [{ lang: "hy" }];
  events.dispatchEvent(new Event("voiceschanged"));
  assert.equal(spoken.length, count + 2);
  window.speechSynthesis.speak = () => { throw new Error("unsupported"); };
  assert.equal(speak(message, true), false);
});
