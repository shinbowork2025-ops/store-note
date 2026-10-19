// Chromeのメニューとは別に、ブラウザーが提供するインストール要求を実行する。
const card = document.getElementById('app-install');
const button = document.getElementById('install-app');
const status = document.getElementById('install-status');
let pendingPrompt = null;

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  pendingPrompt = event;
  card.hidden = false;
  button.disabled = false;
  status.textContent = '';
});

button.addEventListener('click', async () => {
  if (!pendingPrompt) return;
  const request = pendingPrompt;
  pendingPrompt = null;
  button.disabled = true;
  try {
    await request.prompt();
    const choice = await request.userChoice;
    status.textContent = choice.outcome === 'accepted'
      ? 'インストールを受け付けました。完了までお待ちください。'
      : 'インストールをキャンセルしました。';
  } catch {
    status.textContent = 'インストールを開始できませんでした。ページを開き直してお試しください。';
  }
});

window.addEventListener('appinstalled', () => {
  pendingPrompt = null;
  card.hidden = true;
});
