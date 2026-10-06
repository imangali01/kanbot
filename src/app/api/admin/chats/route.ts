import { requireAdmin } from '@/server/admin';
import { getCreatorIds, listAllChats, listMembers } from '@/server/chats';
import { handle } from '@/server/http';
import { displayName } from '@/telegram/messages';

export const dynamic = 'force-dynamic';

export function GET(req: Request) {
  return handle(async () => {
    await requireAdmin(req);
    const chats = await listAllChats();
    return {
      chats: await Promise.all(
        chats.map(async (c) => ({
          id: c.id,
          title: c.title,
          type: c.type,
          status: c.status,
          creatorsMode: c.creatorsMode,
          creatorIds: await getCreatorIds(c.id),
          members: (await listMembers(c.id)).map((m) => ({ userId: m.id, name: displayName(m), custom: !!m.displayName })),
        })),
      ),
    };
  });
}
