import { z } from 'zod';
import { DM_EVENT_KEYS } from '@/domain/dmEvents';
import { requireAdmin } from '@/server/admin';
import { getChat, setChatStatus, setCreators, setCreatorsMode, setDmOff } from '@/server/chats';
import { AccessError } from '@/server/errors';
import { handle, toId, type Params } from '@/server/http';
import { getUsers } from '@/server/users';

export const dynamic = 'force-dynamic';

const schema = z.object({
  status: z.enum(['enabled', 'disabled']).optional(),
  creatorsMode: z.enum(['all', 'list']).optional(),
  creatorIds: z.array(z.number().int()).max(500).optional(),
  dmOff: z.array(z.enum(DM_EVENT_KEYS)).max(DM_EVENT_KEYS.length).optional(),
});

export function PATCH(req: Request, { params }: Params<'chatId'>) {
  return handle(async () => {
    await requireAdmin(req);
    const chatId = toId((await params).chatId);
    if (!(await getChat(chatId))) throw new AccessError(404, 'Чат не найден');
    const body = schema.parse(await req.json());
    if (body.status) await setChatStatus(chatId, body.status);
    if (body.creatorsMode) await setCreatorsMode(chatId, body.creatorsMode);
    if (body.dmOff) await setDmOff(chatId, [...new Set(body.dmOff)]);
    if (body.creatorIds) await setCreators(chatId, (await getUsers(body.creatorIds)).map((u) => u.id));
    return { ok: true };
  });
}
