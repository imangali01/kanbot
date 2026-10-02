import { describe, expect, it } from 'vitest';
import { CODE_TTL_MS, LOCK_MS, MAX_ATTEMPTS, canIssue, issue, verify } from './loginThrottle';

const T0 = 1_000_000;

describe('loginThrottle', () => {
  it('issues a code valid for 5 minutes', () => {
    const s = issue('h1', T0);
    expect(s).toEqual({ codeHash: 'h1', expiresAt: T0 + CODE_TTL_MS, attempts: 0, lockedUntil: null });
    expect(CODE_TTL_MS).toBe(5 * 60 * 1000);
  });
  it('accepts the right code and consumes it', () => {
    expect(verify(issue('h1', T0), 'h1', T0 + 1000)).toEqual({ result: 'ok', next: null });
  });
  it('rejects without a code', () => {
    expect(verify(null, 'h1', T0)).toEqual({ result: 'no_code', next: null });
  });
  it('rejects an expired code', () => {
    expect(verify(issue('h1', T0), 'h1', T0 + CODE_TTL_MS + 1).result).toBe('expired');
  });
  it('counts wrong attempts and locks after 5', () => {
    let s = issue('h1', T0);
    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      const r = verify(s, 'bad', T0 + i);
      expect(r.result).toBe('wrong');
      s = r.next!;
    }
    const last = verify(s, 'bad', T0 + 10);
    expect(last.result).toBe('locked');
    expect(last.next!.lockedUntil).toBe(T0 + 10 + LOCK_MS);
    expect(verify(last.next, 'h1', T0 + 20).result).toBe('locked');
  });
  it('does not issue a new code while locked, allows after lock', () => {
    const locked = { codeHash: '', expiresAt: 0, attempts: 5, lockedUntil: T0 + LOCK_MS };
    expect(canIssue(locked, T0 + 1)).toBe(false);
    expect(canIssue(locked, T0 + LOCK_MS + 1)).toBe(true);
    expect(canIssue(null, T0)).toBe(true);
  });
});

describe('canIssue with an active code', () => {
  it('does not issue a new code while a valid one exists (prevents resetting the attempt counter)', () => {
    expect(canIssue(issue('h1', T0), T0 + 1000)).toBe(false);
  });
  it('issues again once the previous code expired', () => {
    expect(canIssue(issue('h1', T0), T0 + CODE_TTL_MS + 1)).toBe(true);
  });
});
