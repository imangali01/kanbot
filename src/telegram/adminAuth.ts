import { verifyInitData } from './initData';

export type AdminAuth = { kind: 'none' } | { kind: 'denied' } | { kind: 'admin'; userId: number };

/**
 * Заголовок `Authorization: tma <initData>` из Mini App.
 * none — это не Telegram-авторизация (дальше сработает вход по cookie),
 * denied — данные подделаны, устарели или пользователь не админ.
 */
export function adminFromAuthHeader(header: string, botToken: string, nowSec: number, adminIds: number[]): AdminAuth {
  if (!header.startsWith('tma ')) return { kind: 'none' };
  const verified = verifyInitData(header.slice(4), botToken, nowSec);
  if (!verified || !adminIds.includes(verified.user.id)) return { kind: 'denied' };
  return { kind: 'admin', userId: verified.user.id };
}
