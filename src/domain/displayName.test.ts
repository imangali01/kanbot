import { describe, expect, it } from 'vitest';
import { DISPLAY_NAME_MAX, normalizeDisplayName } from './displayName';

describe('normalizeDisplayName', () => {
  it('обрезает пробелы и схлопывает повторы', () => {
    expect(normalizeDisplayName('  Алия   Ахметова ')).toBe('Алия Ахметова');
  });
  it('пустая строка сбрасывает имя', () => {
    expect(normalizeDisplayName('   ')).toBeNull();
  });
  it('ограничивает длину', () => {
    expect(Array.from(normalizeDisplayName('а'.repeat(100))!)).toHaveLength(DISPLAY_NAME_MAX);
  });
});
