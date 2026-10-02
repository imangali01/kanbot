const { TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, APP_URL } = process.env;
if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_WEBHOOK_SECRET || !APP_URL) {
  console.error('Нужны TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, APP_URL в .env.local');
  process.exit(1);
}
const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    url: `${APP_URL}/api/telegram/webhook`,
    secret_token: TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ['message', 'my_chat_member'],
    drop_pending_updates: true,
  }),
});
console.log(await res.json());
