import { z } from 'zod';
import { requestLoginCode } from '@/server/admin';
import { handle } from '@/server/http';

export const dynamic = 'force-dynamic';

export function POST(req: Request) {
  return handle(async () => {
    const { username } = z.object({ username: z.string().max(80) }).parse(await req.json());
    await requestLoginCode(username);
    return { ok: true };
  });
}
