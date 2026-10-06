import { canView } from '@/domain/permissions';
import { getActor, getChat } from '@/server/chats';
import { AccessError } from '@/server/errors';
import { handle, requireTgUser, toId, type Params } from '@/server/http';
import { boardVersion } from '@/server/tasks';

export const dynamic = 'force-dynamic';

export function GET(req: Request, { params }: Params<'chatId'>) {
  return handle(async () => {
    const user = await requireTgUser(req);
    const chat = await getChat(toId((await params).chatId));
    if (!chat || chat.status !== 'enabled') throw new AccessError(404, 'Доска не найдена');
    if (!canView(await getActor(chat, user.id))) throw new AccessError(403, 'Вы не участник этой группы');
    return { version: await boardVersion(chat.id) };
  });
}
