import { env } from '@/env';
import { tg } from '@/telegram/notifier';
import { AccessError } from './errors';

// Telegram Bot API отдаёт файлы только до 20 МБ
const TOO_BIG = 'Файл слишком большой, чтобы скачать его здесь (лимит Telegram — 20 МБ)';

/** Поток файла из Telegram; токен бота наружу не уходит. */
export async function fetchTelegramFile(att: { fileId: string; size: number | null }): Promise<Response> {
  if (att.size !== null && att.size > 20 * 1024 * 1024) throw new AccessError(413, TOO_BIG);
  let path: string | undefined;
  try {
    path = (await tg().getFile(att.fileId)).file_path;
  } catch {
    throw new AccessError(413, TOO_BIG);
  }
  if (!path) throw new AccessError(404, 'Файл недоступен в Telegram');
  const res = await fetch(`https://api.telegram.org/file/bot${env.botToken}/${path}`);
  if (!res.ok || !res.body) throw new AccessError(502, 'Не удалось получить файл из Telegram');
  return res;
}

/** Имя файла для заголовка Content-Disposition (RFC 5987, кириллица допустима). */
export function contentDisposition(name: string, inline = false): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** Аватарка группы из Telegram (маленький размер). Нет фото — 404, клиент рисует букву. */
export async function fetchChatPhoto(chatId: number): Promise<Response> {
  let photoId: string | undefined;
  try {
    photoId = (await tg().getChat(chatId)).photo?.small_file_id;
  } catch {
    photoId = undefined;
  }
  if (!photoId) throw new AccessError(404, 'У группы нет фото');
  return fetchTelegramFile({ fileId: photoId, size: null });
}

export const PHOTO_HEADERS = { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' };
