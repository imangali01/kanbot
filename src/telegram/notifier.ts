import { Api, GrammyError, InlineKeyboard } from 'grammy';
import { env } from '@/env';
import { setStartedBot } from '@/server/users';

let api: Api | null = null;

export function tg(): Api {
  api ??= new Api(env.botToken);
  return api;
}

async function safe<T>(fn: () => Promise<T>, dmUserId?: number): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof GrammyError && e.error_code === 403 && dmUserId !== undefined) {
      await setStartedBot(dmUserId, false);
    }
    console.error('telegram call failed:', e instanceof GrammyError ? e.description : e);
    return null;
  }
}

export function sendDm(userId: number, html: string, buttons: { text: string; url: string }[] = []) {
  const keyboard = buttons.length ? buttons.reduce((kb, b) => kb.url(b.text, b.url), new InlineKeyboard()) : undefined;
  return safe(
    () => tg().sendMessage(userId, html, { parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup: keyboard }),
    userId,
  );
}

export type WidgetResult = 'sent' | 'blocked' | 'failed';

/**
 * HTML-виджет в личку (Bot API sendWidget; в grammY этого метода пока нет — зовём API напрямую).
 * 'blocked' — человек остановил бота (дальше не пытаемся), 'failed' — любая другая ошибка: вызывающий отправит обычный текст.
 */
export async function sendWidgetDm(userId: number, w: { html: string; height: number; caption: string }, buttons: { text: string; url: string }[] = []): Promise<WidgetResult> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.botToken}/sendWidget`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: userId,
        html: w.html,
        height: w.height,
        caption: w.caption,
        reply_markup: buttons.length ? { inline_keyboard: [buttons.map((b) => ({ text: b.text, url: b.url }))] } : undefined,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error_code?: number; description?: string };
    if (data.ok) return 'sent';
    if (data.error_code === 403) {
      await setStartedBot(userId, false);
      return 'blocked';
    }
    console.error('sendWidget failed:', data.error_code, data.description);
    return 'failed';
  } catch (e) {
    console.error('sendWidget failed:', e);
    return 'failed';
  }
}

export function sendInGroup(chatId: number, html: string) {
  return safe(() => tg().sendMessage(chatId, html, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } }));
}

export function replyInGroup(chatId: number, replyTo: number, html: string, button?: { text: string; url: string }) {
  return safe(() =>
    tg().sendMessage(chatId, html, {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      reply_parameters: { message_id: replyTo, allow_sending_without_reply: true },
      reply_markup: button ? new InlineKeyboard().url(button.text, button.url) : undefined,
    }),
  );
}

export async function deleteMessage(chatId: number, messageId: number): Promise<void> {
  await safe(() => tg().deleteMessage(chatId, messageId));
}
