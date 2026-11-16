import { requireAdmin } from '@/server/admin';
import { PHOTO_HEADERS, fetchChatPhoto } from '@/server/attachments';
import { getChat } from '@/server/chats';
import { AccessError } from '@/server/errors';
import { handle, toId, type Params } from '@/server/http';

export const dynamic = 'force-dynamic';

/** Аватарка группы для админки: нужна и для ждущих включения, и для отключённых групп. */
export async function GET(req: Request, { params }: Params<'chatId'>) {
  let file: Response | null = null;
  const failed = await handle(async () => {
    await requireAdmin(req);
    const chat = await getChat(toId((await params).chatId));
    if (!chat) throw new AccessError(404, 'Чат не найден');
    file = await fetchChatPhoto(chat.id);
    return null;
  });
  if (!file) return failed;
  return new Response((file as Response).body, { headers: PHOTO_HEADERS });
}
