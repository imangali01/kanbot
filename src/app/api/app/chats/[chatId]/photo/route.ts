import { canView } from '@/domain/permissions';
import { fetchTelegramFile } from '@/server/attachments';
import { getActor, getChat } from '@/server/chats';
import { AccessError } from '@/server/errors';
import { handle, requireTgUser, toId, type Params } from '@/server/http';
import { tg } from '@/telegram/notifier';

export const dynamic = 'force-dynamic';

/** Аватарка группы из Telegram. Нет фото — 404, клиент рисует букву. Токен бота наружу не уходит. */
export async function GET(req: Request, { params }: Params<'chatId'>) {
  let file: Response | null = null;
  const failed = await handle(async () => {
    const user = await requireTgUser(req);
    const chat = await getChat(toId((await params).chatId));
    if (!chat || chat.status !== 'enabled') throw new AccessError(404, 'Доска не найдена');
    if (!canView(await getActor(chat, user.id))) throw new AccessError(403, 'Вы не участник этой группы');
    let photoId: string | undefined;
    try {
      photoId = (await tg().getChat(chat.id)).photo?.small_file_id;
    } catch {
      photoId = undefined;
    }
    if (!photoId) throw new AccessError(404, 'У группы нет фото');
    file = await fetchTelegramFile({ fileId: photoId, size: null });
    return null;
  });
  if (!file) return failed;
  return new Response((file as Response).body, {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' },
  });
}
