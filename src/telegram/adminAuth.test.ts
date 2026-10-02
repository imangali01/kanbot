import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { adminFromAuthHeader } from './adminAuth';

const TOKEN = '123:abc';
const ADMINS = [7];

function header(userId: number, token = TOKEN, authDate = 1000): string {
  const fields: Record<string, string> = { auth_date: String(authDate), user: JSON.stringify({ id: userId, first_name: 'Тест' }) };
  const dcs = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret).update(dcs).digest('hex');
  return `tma ${new URLSearchParams({ ...fields, hash }).toString()}`;
}

describe('adminFromAuthHeader', () => {
  it('lets a listed admin in', () => {
    expect(adminFromAuthHeader(header(7), TOKEN, 1500, ADMINS)).toEqual({ kind: 'admin', userId: 7 });
  });
  it('denies a valid user who is not an admin', () => {
    expect(adminFromAuthHeader(header(8), TOKEN, 1500, ADMINS)).toEqual({ kind: 'denied' });
  });
  it('denies a forged signature even for an admin id', () => {
    expect(adminFromAuthHeader(header(7, '999:zzz'), TOKEN, 1500, ADMINS)).toEqual({ kind: 'denied' });
  });
  it('denies stale init data', () => {
    expect(adminFromAuthHeader(header(7), TOKEN, 1000 + 86401, ADMINS)).toEqual({ kind: 'denied' });
  });
  it('denies everyone when the admin list is empty', () => {
    expect(adminFromAuthHeader(header(7), TOKEN, 1500, [])).toEqual({ kind: 'denied' });
  });
  it('ignores headers that are not Telegram auth so the cookie flow can run', () => {
    expect(adminFromAuthHeader('', TOKEN, 1500, ADMINS)).toEqual({ kind: 'none' });
    expect(adminFromAuthHeader('Bearer x', TOKEN, 1500, ADMINS)).toEqual({ kind: 'none' });
  });
});
