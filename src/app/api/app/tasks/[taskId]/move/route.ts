import { z } from 'zod';
import { handle, requireTgUser, toId, type Params } from '@/server/http';
import { moveTask } from '@/server/tasks';

export const dynamic = 'force-dynamic';

const schema = z.object({ status: z.enum(['todo', 'in_progress', 'done']), aboveId: z.number().int().nullable() });

export function POST(req: Request, { params }: Params<'taskId'>) {
  return handle(async () => {
    const user = await requireTgUser(req);
    return moveTask(toId((await params).taskId), user.id, schema.parse(await req.json()));
  });
}
