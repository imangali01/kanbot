const { TELEGRAM_BOT_TOKEN } = process.env;
if (!TELEGRAM_BOT_TOKEN) {
  console.error('Нужен TELEGRAM_BOT_TOKEN в .env.local');
  process.exit(1);
}

async function call(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  console.log(method.padEnd(24), json.ok ? 'ok' : `ОШИБКА: ${json.description}`);
}

const task = { command: 'task', description: 'Поставить задачу: /task @user текст' };
const help = { command: 'help', description: 'Как пользоваться ботом' };

await call('setMyCommands', { commands: [task, help] });
await call('setMyCommands', {
  scope: { type: 'all_private_chats' },
  commands: [{ command: 'start', description: 'Включить личные уведомления' }, help],
});
await call('setMyShortDescription', { short_description: 'Задачи и канбан-доска для рабочих групп в Telegram' });
await call('setMyDescription', {
  description:
    'Ставьте задачи прямо в чате группы: /task @исполнитель текст. Доска с колонками Todo, In progress и Done открывается в приложении. Напишите /help, чтобы узнать подробности.',
});
