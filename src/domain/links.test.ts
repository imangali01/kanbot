import { describe, expect, it } from 'vitest';
import { buildStartParam, miniAppLink, parseStartParam, supergroupMessageLink } from './links';

describe('links', () => {
  it('start param round-trip with negative chat id', () => {
    expect(buildStartParam(-5186674925, 12)).toBe('c-5186674925_t12');
    expect(parseStartParam('c-5186674925_t12')).toEqual({ chatId: -5186674925, taskNumber: 12 });
    expect(parseStartParam('c-100123')).toEqual({ chatId: -100123, taskNumber: null });
  });
  it('rejects garbage', () => {
    expect(parseStartParam('hello')).toBeNull();
    expect(parseStartParam(undefined)).toBeNull();
  });
  it('mini app link', () => {
    expect(miniAppLink('t8981_bot', 'board', 'c-1_t2')).toBe('https://t.me/t8981_bot/board?startapp=c-1_t2');
  });
  it('message link only for supergroups', () => {
    expect(supergroupMessageLink(-1001234567890, 55)).toBe('https://t.me/c/1234567890/55');
    expect(supergroupMessageLink(-5186674925, 55)).toBeNull();
  });
});
