import { z } from 'zod';
import { handle, requireTgUser, toId, type Params } from '@/server/http';
import { deleteTask, getTaskDetail, updateTask } from '@/server/tasks';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  text: z.string().trim().min(1).max(4000).optional(),
  stars: z.number().int().min(1).max(5).optional(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  authorId: z.number().int().positive().optional(),
  assigneeKeys: z.array(z.string().regex(/^(u:\d+|n:[a-z0-9_]{1,64})$/)).max(20).optional(),
});

export function GET(req: Request, { params }: Params<'taskId'>) {
  return handle(async () => {
    const user = await requireTgUser(req);
    return getTaskDetail(toId((await params).taskId), user.id);
  });
}

export function PATCH(req: Request, { params }: Params<'taskId'>) {
  return handle(async () => {
    const user = await requireTgUser(req);
    const patch = patchSchema.parse(await req.json());
    return updateTask(toId((await params).taskId), user.id, patch);
  });
}

export function DELETE(req: Request, { params }: Params<'taskId'>) {
  return handle(async () => {
    const user = await requireTgUser(req);
    await deleteTask(toId((await params).taskId), user.id);
    return { ok: true };
  });
}
