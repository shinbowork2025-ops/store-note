// メモは日付に紐づけて保存する。ホームの再描画は編集中のシートに影響しない。
import * as store from '../store.js';
import { fmtDateJa } from '../util.js';
import { openModal } from '../ui.js';

export function openMemo() {
  const daily = store.getDaily();
  const date = daily.date;
  let revision = 0;
  let savedRevision = 0;
  let pending = Promise.resolve();
  let failed = false;

  const m = openModal(`
    <div class="modal-head"><h2>${fmtDateJa(date)}のメモ</h2><button class="modal-close" aria-label="メモを閉じる">✕</button></div>
    <label class="f-label" for="daily-memo">仕事のメモ</label>
    <textarea id="daily-memo" data-f="daily-memo" rows="9" placeholder="気づいたことや、あとで確認すること"></textarea>
    <div class="memo-save-status" role="status" aria-live="polite">保存済み</div>
    <div class="muted">入力内容は自動保存されます。翌日以降は日次集計で読めます。</div>
    <button class="btn block mt8" data-act="retry-memo" hidden>保存を再試行</button>
    <button class="btn primary block mt8" data-act="close-memo">閉じる</button>
  `, { onBeforeClose: async () => {
    await pending;
    return !failed && savedRevision === revision;
  } });

  const input = m.el.querySelector('[data-f="daily-memo"]');
  const status = m.el.querySelector('.memo-save-status');
  const retry = m.el.querySelector('[data-act="retry-memo"]');
  input.value = daily.memo || '';

  const save = () => {
    const text = input.value;
    const currentRevision = ++revision;
    status.textContent = '保存中…';
    pending = store.saveMemo(date, text).then(() => {
      savedRevision = currentRevision;
      if (currentRevision !== revision) return;
      failed = false;
      status.textContent = '保存済み';
      retry.hidden = true;
    }).catch(() => {
      if (currentRevision !== revision) return;
      failed = true;
      status.textContent = '保存できませんでした。入力内容を残しています。再試行してください。';
      retry.hidden = false;
    });
  };

  input.addEventListener('input', save);
  retry.addEventListener('click', save);
  m.el.querySelector('[data-act="close-memo"]').addEventListener('click', m.requestClose);
  input.focus();
}
