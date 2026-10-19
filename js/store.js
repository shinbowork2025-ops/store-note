// 当日データの共有状態。日次の書き込みとメモ保存を直列化する。
// mutateDaily は書き込み前に必ず ensureToday を呼ぶため、
// 0時をまたいだ後の最初の操作が前日データへ書き込まれることはない。

import * as db from './db.js';
import { toast } from './ui.js';

let daily = null;
let persisted = null; // navigator.storage.persist() の結果
const listeners = new Set();
let pending = Promise.resolve();

// 自動保存・画面再表示・通常の書き込みが互いの変更を上書きしないよう直列化する。
function enqueue(fn) {
  const result = pending.then(fn);
  pending = result.catch(() => {});
  return result;
}

export function onChange(fn) { listeners.add(fn); }
function emit() { for (const fn of listeners) fn(); }

export function getDaily() { return daily; }
export function isPersisted() { return persisted; }
export function setPersisted(v) { persisted = v; }

export async function init() {
  const r = await db.ensureToday();
  daily = r.daily;
  return r;
}

// 日付変更チェック(表示時・visibilitychange時)。締めが起きたら true。
export function refreshDay({ silent = false } = {}) {
  return enqueue(async () => {
    const r = await db.ensureToday();
    const changed = !daily || daily.date !== r.daily.date;
    daily = r.daily;
    if (r.closedDate && !silent) {
      toast(`日付が変わったため ${r.closedDate} の記録を集計しました`);
    }
    if (r.clockBack && !silent) {
      toast('端末の日付が過去に戻っています。記録日に注意してください', 4000);
    }
    if (changed) emit();
    return r;
  });
}

// 当日データを変更して保存する。fn(daily) 内で直接書き換える。
export function mutateDaily(fn, { expectedDate, rememberName } = {}) {
  return enqueue(async () => {
    const r = await db.ensureToday();
    daily = r.daily;
    if (expectedDate && daily.date !== expectedDate) {
      toast('日付が変わりました。今日の画面から入力してください');
      emit();
      return null;
    }
    fn(daily);
    await db.putDaily(daily);
    if (rememberName) await db.rememberScheduleName(rememberName);
    emit();
    return daily;
  });
}

export function saveMemo(date, text) {
  return enqueue(async () => {
    const r = await db.ensureToday();
    await db.saveMemo(date, text);
    daily = await db.getDaily(r.daily.date);
    emit();
  });
}

// 復元・全削除の後に呼ぶ
export function reloadAll() {
  return enqueue(async () => {
    const r = await db.ensureToday();
    daily = r.daily;
    emit();
    return r;
  });
}
