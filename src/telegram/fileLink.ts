import { createHmac, timingSafeEqual } from 'node:crypto';

/** Срок жизни ссылки на скачивание, сек: хватает на запуск загрузки клиентом Telegram. */
export const FILE_LINK_TTL = 300;

const mac = (attachmentId: number, exp: number, secret: string) =>
  createHmac('sha256', secret).update(`file:${attachmentId}:${exp}`).digest('hex');

export function signFileLink(attachmentId: number, nowSec: number, secret: string): { exp: number; sig: string } {
  const exp = nowSec + FILE_LINK_TTL;
  return { exp, sig: mac(attachmentId, exp, secret) };
}

export function verifyFileLink(attachmentId: number, exp: number, sig: string, nowSec: number, secret: string): boolean {
  if (!Number.isFinite(exp) || exp < nowSec) return false;
  const expected = Buffer.from(mac(attachmentId, exp, secret));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
