import { z } from 'zod';
import { setSessionCookie, verifyLoginCode } from '@/server/admin';
import { AccessError } from '@/server/errors';
import { handle } from '@/server/http';

export const dynamic = 'force-dynamic';

const MESSAGES = {
  wrong: 'Неверный код',
  expired: 'Код истёк, запросите новый',
  locked: 'Слишком много попыток, попробуйте через 15 минут',
  no_code: 'Сначала запросите код',
} as const;

export function POST(req: Request) {
  return handle(async () => {
    const { username, code } = z.object({ username: z.string().max(80), code: z.string().regex(/^\d{4}$/) }).parse(await req.json());
    const r = await verifyLoginCode(username, code);
    if (!r.ok) throw new AccessError(401, MESSAGES[r.result]);
    await setSessionCookie(r.token);
    return { ok: true };
  });
}
