import { createHmac, timingSafeEqual } from 'node:crypto';

export interface TgWebAppUser { id: number; username?: string; first_name: string; last_name?: string }

export function verifyInitData(
  initData: string,
  botToken: string,
  nowSec: number,
  maxAgeSec = 86400,
): { user: TgWebAppUser; startParam: string | null } | null {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(dataCheckString).digest();
  const given = Buffer.from(hash, 'hex');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || nowSec - authDate > maxAgeSec) return null;

  try {
    const user = JSON.parse(params.get('user') ?? '') as TgWebAppUser;
    if (!Number.isSafeInteger(user.id)) return null;
    return {
      user: { id: user.id, username: user.username, first_name: user.first_name ?? '', last_name: user.last_name },
      startParam: params.get('start_param'),
    };
  } catch {
    return null;
  }
}
