import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { taskAttachments } from '@/db/schema';
import { env } from '@/env';
import { contentDisposition, fetchTelegramFile } from '@/server/attachments';
import { AccessError } from '@/server/errors';
import { handle, toId } from '@/server/http';
import { verifyFileLink } from '@/telegram/fileLink';

export const dynamic = 'force-dynamic';

/** Скачивание по подписанной ссылке (её выдаёт .../attachments/[id]/link после проверки прав). */
export async function GET(req: Request, { params }: { params: Promise<{ attachmentId: string }> }) {
  let file: Response | null = null;
  let mime = 'application/octet-stream';
  let name = 'file';
  const failed = await handle(async () => {
    const id = toId((await params).attachmentId);
    const q = new URL(req.url).searchParams;
    if (!verifyFileLink(id, Number(q.get('e')), q.get('s') ?? '', Math.floor(Date.now() / 1000), env.botToken)) {
      throw new AccessError(403, 'Ссылка устарела — откройте вложение заново');
    }
    const [att] = await getDb().select().from(taskAttachments).where(eq(taskAttachments.id, id));
    if (!att) throw new AccessError(404, 'Вложение не найдено');
    file = await fetchTelegramFile(att);
    mime = att.mime ?? file.headers.get('content-type') ?? mime;
    name = att.name ?? name;
    return null;
  });
  if (!file) return failed;
  return new Response((file as Response).body, {
    headers: { 'Content-Type': mime, 'Content-Disposition': contentDisposition(name), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}
