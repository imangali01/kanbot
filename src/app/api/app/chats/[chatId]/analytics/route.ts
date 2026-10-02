import { isAssigneeFilter, parseAnalyticsDays } from '@/domain/analytics';
import { canView } from '@/domain/permissions';
import { getActor, getChat } from '@/server/chats';
import { AccessError } from '@/server/errors';
import { handle, requireTgUser, toId, type Params } from '@/server/http';
import { loadAnalytics } from '@/server/tasks';

export const dynamic = 'force-dynamic';

export function GET(req: Request, { params }: Params<'chatId'>) {
  return handle(async () => {
    const user = await requireTgUser(req);
    const query = new URL(req.url).searchParams;
    const days = parseAnalyticsDays(query.get('days'));
    if (!days) throw new AccessError(400, 'Период: 7, 30 или 90 дней');
    const assignee = query.get('assignee');
    if (assignee !== null && !isAssigneeFilter(assignee)) throw new AccessError(400, 'Некорректный исполнитель');
    const chat = await getChat(toId((await params).chatId));
    if (!chat || chat.status !== 'enabled') throw new AccessError(404, 'Доска не найдена');
    const actor = await getActor(chat, user.id);
    if (!canView(actor)) throw new AccessError(403, 'Вы не участник этой группы');
    return loadAnalytics(chat, days, new Date(), assignee);
  });
}
