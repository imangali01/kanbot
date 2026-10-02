import { z } from 'zod';
import { handle, requireTgUser, toId, type Params } from '@/server/http';
import { addComment } from '@/server/tasks';

export const dynamic = 'force-dynamic';

const schema = z.object({ text: z.string().trim().min(1).max(2000) });

export function POST(req: Request, { params }: Params<'taskId'>) {
  return handle(async () => {
    const user = await requireTgUser(req);
    const { text } = schema.parse(await req.json());
    return addComment(toId((await params).taskId), user.id, text);
  });
}
