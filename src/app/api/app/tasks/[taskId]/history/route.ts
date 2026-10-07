import { handle, requireTgUser, toId, type Params } from '@/server/http';
import { getTaskHistory } from '@/server/tasks';

export const dynamic = 'force-dynamic';

export function GET(req: Request, { params }: Params<'taskId'>) {
  return handle(async () => {
    const user = await requireTgUser(req);
    return getTaskHistory(toId((await params).taskId), user.id);
  });
}
