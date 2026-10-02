import { describe, expect, it } from 'vitest';
import { AVATAR_HUES, avatarHue, initials } from './avatarUtils';

describe('initials', () => {
  it('two words give two letters', () => expect(initials('Иван Петров')).toBe('ИП'));
  it('single word gives one letter', () => expect(initials('Анна')).toBe('А'));
  it('strips @ from usernames', () => expect(initials('@ivan')).toBe('I'));
  it('empty name gives a placeholder', () => expect(initials('   ')).toBe('?'));
});

describe('avatarHue', () => {
  it('is stable for the same name', () => expect(avatarHue('Анна')).toBe(avatarHue('Анна')));
  it('always comes from the curated palette', () => {
    for (const n of ['Анна', 'Иван Петров', '@ivan', '😀', '']) expect(AVATAR_HUES).toContain(avatarHue(n));
  });
  it('spreads different names across the palette', () => {
    const hues = new Set(['Анна', 'Иван', 'Мария', 'Пётр', 'Олег', 'Лена', 'Саша', 'Дима'].map(avatarHue));
    expect(hues.size).toBeGreaterThan(3);
  });
});
