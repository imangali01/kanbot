import { canView } from '@/domain/permissions';
import { PHOTO_HEADERS, fetchChatPhoto } from '@/server/attachments';
import { getActor, getChat } from '@/server/chats';
import { AccessError } from '@/server/errors';
import { handle, requireTgUser, toId, type Params } from '@/server/http';

export const dynamic = 'force-dynamic';

/** Аватарка группы для участников. Токен бота наружу не уходит. */
export async function GET(req: Request, { params }: Params<'chatId'>) {
  let file: Response | null = null;
  const failed = await handle(async () => {
    const user = await requireTgUser(req);
    const chat = await getChat(toId((await params).chatId));
    if (!chat || chat.status !== 'enabled') throw new AccessError(404, 'Доска не найдена');
    if (!canView(await getActor(chat, user.id))) throw new AccessError(403, 'Вы не участник этой группы');
    file = await fetchChatPhoto(chat.id);
    return null;
  });
  if (!file) return failed;
  return new Response((file as Response).body, { headers: PHOTO_HEADERS });
}
