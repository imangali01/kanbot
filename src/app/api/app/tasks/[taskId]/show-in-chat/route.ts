import { handle, requireTgUser, toId, type Params } from '@/server/http';
import { showInChat } from '@/server/tasks';

export const dynamic = 'force-dynamic';

export function POST(req: Request, { params }: Params<'taskId'>) {
  return handle(async () => {
    const user = await requireTgUser(req);
    return showInChat(toId((await params).taskId), user.id);
  });
}
