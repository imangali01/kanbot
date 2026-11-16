import { env } from '@/env';
import { handle, requireTgUser, toId } from '@/server/http';
import { getAttachmentForDownload } from '@/server/tasks';
import { signFileLink } from '@/telegram/fileLink';

export const dynamic = 'force-dynamic';

/** Подписанная короткоживущая ссылка: клиент Telegram скачивает по ней сам, без заголовка авторизации. */
export function GET(req: Request, { params }: { params: Promise<{ taskId: string; attachmentId: string }> }) {
  return handle(async () => {
    const user = await requireTgUser(req);
    const { taskId, attachmentId } = await params;
    const att = await getAttachmentForDownload(toId(taskId), toId(attachmentId), user.id);
    const { exp, sig } = signFileLink(att.id, Math.floor(Date.now() / 1000), env.botToken);
    const origin = new URL(req.url).origin;
    return { url: `${origin}/api/files/${att.id}?e=${exp}&s=${sig}` };
  });
}
