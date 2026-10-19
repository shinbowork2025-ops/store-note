// 新しいインストール入口の起動・既存データ共有・オフライン動作。
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
const BASE = 'http://127.0.0.1:8123';

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox'],
  });
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ja-JP' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(BASE + '/');
    await page.locator('[data-act="edit-memo"]').waitFor();
    await page.click('[data-act="edit-memo"]');
    await page.fill('#daily-memo', '元の入口で保存したメモ');
    await page.getByRole('status').filter({ hasText: '保存済み' }).waitFor();
    await page.click('[data-act="close-memo"]');

    await page.goto(BASE + '/app/');
    await page.locator('.memo-preview').waitFor();
    assert.equal(await page.locator('.memo-preview').textContent(), '元の入口で保存したメモ');
    console.log('PASS 新しい入口で既存データを共有');
    const info = await page.evaluate(async () => {
      const href = document.querySelector('link[rel="manifest"]').href;
      const manifest = await (await fetch(href)).json();
      const oldHref = new URL('../manifest.webmanifest', href).href;
      const old = await (await fetch(oldHref)).json();
      return {
        id: new URL(manifest.id, href).href,
        start: new URL(manifest.start_url, href).href,
        scope: new URL(manifest.scope, href).href,
        oldId: new URL(old.id || old.start_url, oldHref).href,
      };
    });
    assert.notEqual(info.id, info.oldId);
    assert.equal(info.start, BASE + '/app/');
    assert.equal(info.scope, BASE + '/app/');
    console.log('PASS 元のアプリと異なる識別子・起動先・対象範囲');

    await page.click('#bottomnav a[data-route="schedule"]');
    await page.click('[data-act="edit"]');
    await page.locator('[data-f="schedule-name"]').waitFor();
    assert.equal(page.url(), BASE + '/app/#/schedule');
    console.log('PASS 新しい入口でスケジュール編集画面を表示し、同じ入口を維持');
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await ctx.setOffline(true);
    await page.reload();
    await page.locator('.timeline').waitFor();
    console.log('PASS 新しい入口のオフライン起動');
    await page.click('#bottomnav a[data-route="home"]');
    await page.locator('.memo-preview').waitFor();
    assert.equal(await page.locator('.memo-preview').textContent(), '元の入口で保存したメモ');
    assert.deepEqual(errors, []);
    console.log('PASS オフラインでもメモを保持し、画面エラーなし');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
