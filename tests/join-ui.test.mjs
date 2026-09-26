import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { load } from './load.mjs';
const { ScheduleRefresh } = await import(await load('refresh'));

// Execute the real UI handlers with native/DOM boundaries replaced; no WebView
// or user's cache is touched. In particular, submit must not silently no-op.
async function ui({ restore = async () => {}, configError, selection = null, refresh = async () => {} } = {}) {
  const elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, {
      hidden: true, textContent: '', value: 'KRMZ', dataset: {}, handlers: {},
      addEventListener(name, callback) { this.handlers[name] = callback; },
      focus() {}, replaceChildren() {},
    });
    return elements.get(selector);
  };
  let restores = 0, previews = 0, now = 0;
  const events = {}, invocations = [];
  class Connection {
    selection = selection;
    async refresh() { await refresh(); }
    async restore() { restores++; await restore(); }
    cancel() {}
    async preview(code) { previews++; assert.equal(code, 'KRMZ'); return {schoolName:'Դպրոց',className:'5Ա'}; }
  }
  let source = await readFile(new URL('../src/main.ts',import.meta.url),'utf8');
  source = source.replace(/^import .*;\r?\n/gm,'').replace(/import\.meta\.env/g,'buildEnv');
  const js = ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
  vm.runInNewContext(js, {
    document: {querySelector:element,querySelectorAll:()=>[],addEventListener(){}}, window:{setInterval(){}},
    ScheduleRefresh: class extends ScheduleRefresh {
      constructor(refresh, allowed) { super(refresh, allowed, () => now); }
    },
    listen: async (name, callback) => { events[name] = callback; },
    Connection, publicationConfig:()=>{if(configError) throw configError; return {};},
    buildEnv:{}, invoke:async(name)=>{invocations.push(name);}, stopSpeech(){}, console, Error,
    initializeTray:async()=>{},initializeSettings:async()=>{},
  });
  await new Promise(resolve=>setImmediate(resolve));
  return {element, invocations, async tick(time) {
      now = time; events['schedule-refresh-tick']();
      await new Promise(resolve => setImmediate(resolve));
    }, submit:()=>element('#join-form').handlers.submit({preventDefault(){}}),
    counts:()=>({restores,previews})};
}

test('join submit reports missing build configuration again instead of doing nothing', async () => {
  const page=await ui({configError:new Error('Supabase configuration missing')});
  page.element('#status').textContent='';
  await page.submit();
  assert.match(page.element('#status').textContent,/configuration missing/);
  assert.equal(page.element('#class-preview').textContent,'');
  assert.equal(page.element('#retry').hidden,false);
});

test('join submit retries failed native initialization and shows the class preview', async () => {
  let attempts=0;
  const page=await ui({restore:async()=>{if(++attempts===1) throw new Error('Storage unavailable');}});
  await page.submit();
  assert.deepEqual(page.counts(),{restores:2,previews:1});
  assert.equal(page.element('#class-preview').textContent,'Դպրոց · 5Ա');
  assert.equal(page.element('#join-confirm').hidden,false);
});

test('join submit waits for pending restoration without duplicating initialization', async () => {
  let release;
  const pending=new Promise(resolve=>{release=resolve;});
  const page=await ui({restore:()=>pending});
  const submitted=page.submit();
  assert.deepEqual(page.counts(),{restores:1,previews:0});
  release(); await submitted;
  assert.deepEqual(page.counts(),{restores:1,previews:1});
  assert.equal(page.element('#join-confirm').hidden,false);
});


test('clicking the header class code opens the existing join form', async () => {
  const page = await ui();
  page.element('#join-form').hidden = true;
  page.element('#change-class').handlers.click();
  assert.equal(page.element('#join-form').hidden, false);
  assert.equal(page.element('#join-confirm').hidden, true);
});


test('native ticks refresh a selected class quietly and defer while joining', async () => {
  let requests = 0;
  const page = await ui({selection: {joinCode: 'KRMZ'}, refresh: async () => {
    if (++requests > 1) throw new Error('Offline');
  }});
  assert.equal(requests, 1);
  await page.tick(899_999); assert.equal(requests, 1);
  await page.tick(900_000); assert.equal(requests, 2);
  assert.match(page.element('#status').textContent, /Offline/);
  assert.equal(page.invocations.includes('show_main_window'), false);
  page.element('#change-class').handlers.click();
  await page.tick(1_800_000); assert.equal(requests, 2);
  page.element('#join-cancel').handlers.click();
  await page.tick(1_810_000); assert.equal(requests, 3);
});
