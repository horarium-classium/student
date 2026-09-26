import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the real UI handlers with native/DOM boundaries replaced; no WebView
// or user's cache is touched. In particular, submit must not silently no-op.
async function ui({ restore = async () => {}, configError } = {}) {
  const elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, {
      hidden: true, textContent: '', value: 'KRMZ', dataset: {}, handlers: {},
      addEventListener(name, callback) { this.handlers[name] = callback; },
      focus() {}, replaceChildren() {},
    });
    return elements.get(selector);
  };
  let restores = 0, previews = 0;
  class Connection {
    selection = null;
    async restore() { restores++; await restore(); }
    cancel() {}
    async preview(code) { previews++; assert.equal(code, 'KRMZ'); return {schoolName:'Դպրոց',className:'5Ա'}; }
  }
  let source = await readFile(new URL('../src/main.ts',import.meta.url),'utf8');
  source = source.replace(/^import .*;\r?\n/gm,'').replace(/import\.meta\.env/g,'buildEnv');
  const js = ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
  vm.runInNewContext(js, {
    document: {querySelector:element,querySelectorAll:()=>[],addEventListener(){}}, window:{setInterval(){}},
    Connection, publicationConfig:()=>{if(configError) throw configError; return {};},
    buildEnv:{}, invoke:async()=>{}, stopSpeech(){}, console, Error,
    initializeTray:async()=>{},initializeSettings:async()=>{},
  });
  await new Promise(resolve=>setImmediate(resolve));
  return {element,submit:()=>element('#join-form').handlers.submit({preventDefault(){}}),
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
