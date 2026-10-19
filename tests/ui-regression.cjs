// DOM上の操作と保存連携を検証する。実ブラウザーの描画・タッチ操作はsmoke.jsで確認する。
// npm install --no-save esbuild jsdom fake-indexeddb
// node tests/ui-regression.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSync } = require('esbuild');
const { JSDOM } = require('jsdom');
const { indexedDB } = require('fake-indexeddb');
const root = path.resolve(__dirname, '..');
const bundle = buildSync({
  stdin: {
    contents: "import './js/app.js'; export * as db from './js/db.js'; export * as store from './js/store.js';",
    resolveDir: root,
  },
  bundle: true, write: false, format: 'iife', globalName: 'StoreNoteTest',
}).outputFiles[0].text;
const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), {
  url: 'http://localhost/index.html', runScripts: 'outside-only', pretendToBeVisual: true,
});
const w = dom.window;
w.indexedDB = indexedDB;
w.structuredClone = structuredClone;
w.scrollTo = () => {};
w.Element.prototype.setPointerCapture = () => {};
let passed = 0;
const errors = [];
w.addEventListener('error', event => errors.push(event.message));
function check(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }
const find = selector => w.document.querySelector(selector);
const all = selector => [...w.document.querySelectorAll(selector)];
async function until(fn) {
  for (let i = 0; i < 200; i++) {
    if (fn()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('状態更新を待機中に時間切れ');
}
function fill(selector, value) {
  const el = find(selector);
  el.value = value;
  el.dispatchEvent(new w.Event('input', { bubbles: true }));
}
async function navigate(route, expected) {
  find(`#bottomnav a[data-route="${route}"]`).click();
  await until(() => find(expected));
}
async function paint(index) {
  const cell = find(`.pg-cell[data-slot="${index}"]`);
  cell.dispatchEvent(new w.Event('pointerdown', { bubbles: true, cancelable: true }));
  cell.dispatchEvent(new w.Event('pointerup', { bubbles: true }));
  await until(() => find(`.pg-cell[data-slot="${index}"]`) !== cell);
}

(async () => {
  w.eval(bundle);
  await until(() => find('[data-act="edit-memo"]'));
  const { db, store } = w.StoreNoteTest;
  find('[data-act="edit-memo"]').click();
  await until(() => find('#daily-memo'));
  fill('#daily-memo', '売場のメモ\n<img src=x onerror=alert(1)>');
  await until(() => find('.memo-save-status').textContent === '保存済み');
  check('メモの自動保存状態を表示', () => assert.equal(store.getDaily().memo, '売場のメモ\n<img src=x onerror=alert(1)>'));
  find('[data-act="close-memo"]').click();
  await until(() => !find('#daily-memo') && find('.memo-preview'));
  check('メモの改行を保持しHTMLを実行しない', () => {
    assert.equal(find('.memo-preview').textContent, store.getDaily().memo);
    assert.equal(find('.memo-preview img'), null);
  });

  await navigate('schedule', '[data-act="edit"]');
  find('[data-act="edit"]').click();
  await until(() => find('[data-f="schedule-name"]'));
  check('既定の候補は表示しない', () => assert.equal(all('[data-tool="preset"]').length, 0));
  fill('[data-f="schedule-name"]', ' 鉢の補充 ');
  find('[data-tool="free"]').click();
  check('選択しただけでは候補に追加しない', () => assert.equal(all('[data-tool="preset"]').length, 0));
  await paint(9);
  check('実際の時間帯への登録で候補が増える', () => {
    assert.equal(all('[data-tool="preset"]').length, 1);
    assert.equal(find('.pg-cell[data-slot="9"]').textContent, '鉢の補充');
  });
  fill('[data-f="schedule-name"]', '鉢の補充');
  find('[data-tool="free"]').click();
  await paint(10);
  check('同名を再入力しても候補は重複しない', () => assert.equal(all('[data-tool="preset"]').length, 1));
  let old = find('.pg-cell[data-slot="10"]');
  find('[data-act="undo"]').click();
  await until(() => find('.pg-cell[data-slot="10"]') !== old);
  check('予定の取り消しが動く', () => assert.equal(store.getDaily().schedule[10], null));
  old = find('.pg-cell[data-slot="10"]');
  find('[data-act="redo"]').click();
  await until(() => find('.pg-cell[data-slot="10"]') !== old);
  check('予定のやり直しが動く', () => assert.equal(store.getDaily().schedule[10].t, '鉢の補充'));
  find('[data-act="done"]').click();
  await until(() => find('.timeline'));
  check('タイムラインに登録した予定を表示', () => assert.ok(find('.timeline').textContent.includes('鉢の補充')));

  find('#btn-settings').click();
  await until(() => find('[data-sec="presets"]'));
  const name = find('[data-sec="presets"] [data-f="name"]');
  name.value = '売場整理';
  name.dispatchEvent(new w.Event('change', { bubbles: true }));
  await db.getPresets();
  await navigate('schedule', '.timeline');
  check('候補改名後も登録済み予定の名前は変わらない', () => assert.ok(find('.timeline').textContent.includes('鉢の補充')));
  find('[data-act="edit"]').click();
  await until(() => find('[data-tool="preset"]'));
  check('今後の入力候補には変更後の名前を表示', () => assert.ok(find('[data-tool="preset"]').textContent.includes('売場整理')));
  await paint(11);
  check('同名入力で選択状態を維持', () => assert.equal(store.getDaily().schedule[11].t, '売場整理'));

  const backup = await db.exportBackup();
  await db.wipeAll();
  await db.importBackup(backup);
  await store.reloadAll();
  await navigate('home', '.memo-preview');
  check('バックアップ復元後もホームにメモを表示', () => assert.equal(find('.memo-preview').textContent, backup.data.daily.memo));
  check('画面処理にJavaScriptエラーがない', () => assert.deepEqual(errors, []));
  console.log(`\n${passed}/${passed} passed (DOM simulation)`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => dom.window.close());
