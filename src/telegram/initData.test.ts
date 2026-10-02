import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyInitData } from './initData';

const TOKEN = '123:abc';

function sign(fields: Record<string, string>, token = TOKEN): string {
  const dcs = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret).update(dcs).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

const user = JSON.stringify({ id: 7, first_name: 'Имангали', username: 'iman' });

describe('verifyInitData', () => {
  it('accepts valid data and returns user and start param', () => {
    const data = sign({ auth_date: '1000', user, start_param: 'c-1_t2', query_id: 'q' });
    expect(verifyInitData(data, TOKEN, 1500)).toEqual({ user: { id: 7, first_name: 'Имангали', username: 'iman' }, startParam: 'c-1_t2' });
  });
  it('rejects tampered data', () => {
    const data = sign({ auth_date: '1000', user }).replace('%D0%98', '%D0%90');
    expect(verifyInitData(data, TOKEN, 1500)).toBeNull();
  });
  it('rejects another token', () => {
    expect(verifyInitData(sign({ auth_date: '1000', user }, '999:zzz'), TOKEN, 1500)).toBeNull();
  });
  it('rejects data older than 24h', () => {
    expect(verifyInitData(sign({ auth_date: '1000', user }), TOKEN, 1000 + 86401)).toBeNull();
  });
  it('rejects missing hash', () => {
    expect(verifyInitData('auth_date=1000', TOKEN, 1500)).toBeNull();
  });
});
