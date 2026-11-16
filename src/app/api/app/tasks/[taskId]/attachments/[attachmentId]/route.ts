import { contentDisposition, fetchTelegramFile } from '@/server/attachments';
import { handle, requireTgUser, toId } from '@/server/http';
import { getAttachmentForDownload } from '@/server/tasks';

export const dynamic = 'force-dynamic';

/** Файл для превью в карточке: токен бота наружу не уходит, доступ проверяется по initData. */
export async function GET(req: Request, { params }: { params: Promise<{ taskId: string; attachmentId: string }> }) {
  let file: Response | null = null;
  let mime = 'application/octet-stream';
  let name = 'file';
  const failed = await handle(async () => {
    const user = await requireTgUser(req);
    const { taskId, attachmentId } = await params;
    const att = await getAttachmentForDownload(toId(taskId), toId(attachmentId), user.id);
    file = await fetchTelegramFile(att);
    mime = att.mime ?? file.headers.get('content-type') ?? mime;
    name = att.name ?? name;
    return null;
  });
  if (!file) return failed;
  return new Response((file as Response).body, {
    headers: { 'Content-Type': mime, 'Content-Disposition': contentDisposition(name, true), 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' },
  });
}
