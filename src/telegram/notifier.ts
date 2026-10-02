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

export function sendDm(userId: number, html: string) {
  return safe(() => tg().sendMessage(userId, html, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } }), userId);
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
