import { z } from 'zod';
import { normalizeDisplayName } from '@/domain/displayName';
import { requireAdmin } from '@/server/admin';
import { AccessError } from '@/server/errors';
import { handle, toId, type Params } from '@/server/http';
import { getUsers, setDisplayName } from '@/server/users';

export const dynamic = 'force-dynamic';

const schema = z.object({ displayName: z.string().max(200) });

export function PATCH(req: Request, { params }: Params<'userId'>) {
  return handle(async () => {
    await requireAdmin(req);
    const userId = toId((await params).userId);
    if (!(await getUsers([userId])).length) throw new AccessError(404, 'Пользователь не найден');
    const body = schema.parse(await req.json());
    await setDisplayName(userId, normalizeDisplayName(body.displayName));
    return { ok: true };
  });
}
