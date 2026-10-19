// npm install --no-save fake-indexeddb
// node tests/data-regression.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
globalThis.indexedDB = require('fake-indexeddb').indexedDB;

const db = await import('../js/db.js');
const store = await import('../js/store.js');
const { todayStr } = await import('../js/util.js');
const today = todayStr();
const oldDate = '2000-01-01';
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }

await store.init();
check('新規のメモは空', () => assert.equal(store.getDaily().memo, ''));
let initialPresets = await db.getPresets();
check('新規インストールでは既定の予定候補がない', () => assert.deepEqual(initialPresets, []));

await Promise.all([' 鉢の補充 ', '鉢の補充', '鉢の補充'].map(db.rememberScheduleName));
let presets = await db.getPresets();
check('前後の空白・並行登録でも同名候補は1件', () => assert.equal(presets.length, 1));
const originalName = presets[0].name;
const originalColor = presets[0].color;
const slots = db.snapshotSlots([{ p: presets[0].id }], presets);
presets[0].name = '売場の補充';
presets[0].color = '#000000';
await db.savePresets(presets);
check('改名・色変更後も登録済み予定は元の内容', () => {
  assert.equal(db.slotLabel(slots[0], presets), originalName);
  assert.equal(slots[0].c, originalColor);
});
await db.savePresets([]);
check('候補削除後も予定名を保持', () => assert.equal(db.slotLabel(slots[0], []), originalName));

await Promise.all([
  store.saveMemo(today, '短いメモ'),
  store.mutateDaily(d => d.todos.push({ id: 'test', text: '補充', status: 'todo' })),
  store.saveMemo(today, '今日の気づき\n<img src=x onerror=alert(1)>'),
]);
let daily = await db.getDaily(today);
check('メモ自動保存とタスク操作が互いを上書きしない', () => {
  assert.equal(daily.todos.length, 1);
  assert.equal(daily.memo, '今日の気づき\n<img src=x onerror=alert(1)>');
});
const backup = await db.exportBackup();
await db.wipeAll();
await db.importBackup(backup);
await store.reloadAll();
check('新版バックアップでメモと候補方式を復元', () => {
  assert.equal(db.validateBackup(backup), null);
  assert.equal(backup.schemaVersion, 2);
  assert.equal(store.getDaily().memo, daily.memo);
});

const legacy = {
  app: db.APP_ID, schemaVersion: 1, exportedAt: new Date().toISOString(),
  data: {
    orders: [], summaries: [], meta: { lastUsedDate: today },
    presets: [
      { id: 'p-reji', name: 'レジ', color: '#2563eb', visible: true },
      { id: 'custom', name: '棚の整備', color: '#475569', visible: true },
      { id: 'p-hiru', name: '食事休憩', color: '#f59e0b', visible: true },
    ],
    templates: [{ id: 'old', name: '早番', slots: [{ p: 'p-reji' }, { p: 'custom' }] }],
    daily: { ...db.emptyDaily(today), schedule: [{ p: 'p-reji' }, ...Array(53).fill(null)] },
  },
};
await db.importBackup(legacy);
// exportBackup単体でも、移行後の候補と予定の対応を保つ。
const migrated = await db.exportBackup();
presets = await db.getPresets();
check('旧版の未変更の既定候補のみ削除', () => assert.deepEqual(presets.map(p => p.name), ['棚の整備', '食事休憩']));
check('旧版の予定・テンプレートの表示名と色を保持', () => {
  assert.equal(migrated.data.daily.schedule[0].t, 'レジ');
  assert.equal(migrated.data.daily.schedule[0].c, '#2563eb');
  assert.equal(migrated.data.templates[0].slots[0].t, 'レジ');
});
await db.importBackup(migrated);
await store.reloadAll();
check('移行済みバックアップを復元しても既定候補は戻らない', () => assert.equal(store.getDaily().schedule[0].t, 'レジ'));
assert.equal((await db.getPresets()).length, 2);

await db.saveMeta({ lastUsedDate: oldDate });
daily = { ...db.emptyDaily(oldDate), memo: '前日の記録' };
await db.putDaily(daily);
await store.reloadAll();
check('日付変更後の当日メモは空', () => assert.equal(store.getDaily().memo, ''));
await store.saveMemo(oldDate, '日付変更中に追記したメモ');
const summaries = await db.getSummaries();
check('編集中の日付変更後も元の日付へ保存', () => {
  assert.equal(summaries.find(s => s.date === oldDate).memo, '日付変更中に追記したメモ');
  assert.equal(store.getDaily().memo, '');
});
const closedDaily = await db.getDaily(oldDate);
check('締め処理後は前日の日次データを削除', () => assert.equal(closedDaily, undefined));
await db.rememberScheduleName('__proto__');
const summary = db.computeSummary({ ...db.emptyDaily(today), schedule: [{ t: '__proto__' }] }, []);
check('任意の予定名を正しく集計', () => assert.equal(summary.schedule.byItem.__proto__, 15));
console.log(`\n${passed}/${passed} passed`);
