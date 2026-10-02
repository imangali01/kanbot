import { env } from '@/env';
import { handle, requireTgUser } from '@/server/http';
import { listChatsForUser } from '@/server/chats';

export const dynamic = 'force-dynamic';

export function GET(req: Request) {
  return handle(async () => {
    const user = await requireTgUser(req);
    const chats = await listChatsForUser(user.id);
    return { chats: chats.map((c) => ({ id: c.id, title: c.title })), isAdmin: env.superadminIds.includes(user.id) };
  });
}
