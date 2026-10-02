import { z } from 'zod';
import { handle, requireTgUser, toId, type Params } from '@/server/http';
import { blockTask, unblockTask } from '@/server/tasks';

export const dynamic = 'force-dynamic';

const schema = z.object({ reason: z.string().trim().min(1).max(500) });

export function POST(req: Request, { params }: Params<'taskId'>) {
  return handle(async () => {
    const user = await requireTgUser(req);
    const { reason } = schema.parse(await req.json());
    return blockTask(toId((await params).taskId), user.id, reason);
  });
}

export function DELETE(req: Request, { params }: Params<'taskId'>) {
  return handle(async () => {
    const user = await requireTgUser(req);
    return unblockTask(toId((await params).taskId), user.id);
  });
}
