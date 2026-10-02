import { describe, expect, it } from 'vitest';
import { parseIdList } from './env';

describe('parseIdList', () => {
  it('parses comma-separated ids and ignores junk', () => {
    expect(parseIdList(' 123, 456 ,abc,, 789')).toEqual([123, 456, 789]);
  });
  it('returns empty list for undefined', () => {
    expect(parseIdList(undefined)).toEqual([]);
  });
});
