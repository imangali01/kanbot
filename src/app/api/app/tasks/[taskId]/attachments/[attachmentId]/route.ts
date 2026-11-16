import { env } from '@/env';
import { AccessError } from '@/server/errors';
import { handle, requireTgUser, toId } from '@/server/http';
import { getAttachmentForDownload } from '@/server/tasks';
import { tg } from '@/telegram/notifier';

export const dynamic = 'force-dynamic';

// Telegram Bot API отдаёт файлы только до 20 МБ
const TOO_BIG = 'Файл слишком большой, чтобы показать его здесь (лимит Telegram — 20 МБ)';

/** Прокси к файлу в Telegram: токен бота наружу не уходит, доступ проверяется по initData. */
export async function GET(req: Request, { params }: { params: Promise<{ taskId: string; attachmentId: string }> }) {
  let file: Response | null = null;
  let mime = 'application/octet-stream';
  const failed = await handle(async () => {
    const user = await requireTgUser(req);
    const { taskId, attachmentId } = await params;
    const att = await getAttachmentForDownload(toId(taskId), toId(attachmentId), user.id);
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
    file = res;
    mime = att.mime ?? res.headers.get('content-type') ?? mime;
    return null;
  });
  if (!file) return failed;
  return new Response((file as Response).body, {
    headers: { 'Content-Type': mime, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' },
  });
}
