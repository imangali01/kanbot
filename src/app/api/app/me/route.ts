import { z } from 'zod';
import { normalizeDisplayName } from '@/domain/displayName';
import { handle, requireTgUser } from '@/server/http';
import { setDisplayName } from '@/server/users';

export const dynamic = 'force-dynamic';

const schema = z.object({ displayName: z.string().max(200) });

export function PATCH(req: Request) {
  return handle(async () => {
    const user = await requireTgUser(req);
    const body = schema.parse(await req.json());
    await setDisplayName(user.id, normalizeDisplayName(body.displayName));
    return { ok: true };
  });
}
