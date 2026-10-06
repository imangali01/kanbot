import { describe, expect, it } from 'vitest';
import { activeMention, applyMention, filterMembers, mentionHandle, splitMentions, type MentionMember } from './mentions';

const anna: MentionMember = { userId: 1, username: 'anna_k', name: 'Анна Ким' };
const boris: MentionMember = { userId: 2, username: null, name: 'Борис Ли' };
const members = [anna, boris];

describe('mentionHandle', () => {
  it('username или имя с подчёркиваниями', () => {
    expect(mentionHandle(anna)).toBe('anna_k');
    expect(mentionHandle(boris)).toBe('Борис_Ли');
  });
});

describe('splitMentions', () => {
  it('находит упоминания участников', () => {
    expect(splitMentions('привет @anna_k и @Борис_Ли!', members)).toEqual([
      { type: 'text', text: 'привет ' },
      { type: 'mention', text: '@anna_k', member: anna },
      { type: 'text', text: ' и ' },
      { type: 'mention', text: '@Борис_Ли', member: boris },
      { type: 'text', text: '!' },
    ]);
  });
  it('регистр не важен, незнакомые @слова и e-mail остаются текстом', () => {
    expect(splitMentions('@ANNA_K @nobody a@anna_k', members)).toEqual([
      { type: 'mention', text: '@ANNA_K', member: anna },
      { type: 'text', text: ' @nobody a@anna_k' },
    ]);
  });
  it('текст без упоминаний — один кусок', () => {
    expect(splitMentions('просто текст', members)).toEqual([{ type: 'text', text: 'просто текст' }]);
  });
});

describe('activeMention', () => {
  it('видит @ перед курсором', () => {
    expect(activeMention('привет @ан', 10)).toEqual({ start: 7, query: 'ан' });
    expect(activeMention('@', 1)).toEqual({ start: 0, query: '' });
  });
  it('не срабатывает внутри слова или без @', () => {
    expect(activeMention('a@b', 3)).toBeNull();
    expect(activeMention('привет', 6)).toBeNull();
    expect(activeMention('@ан привет', 10)).toBeNull();
  });
});

describe('filterMembers', () => {
  it('по имени и username', () => {
    expect(filterMembers(members, 'ким')).toEqual([anna]);
    expect(filterMembers(members, 'ANNA')).toEqual([anna]);
    expect(filterMembers(members, '')).toEqual(members);
  });
});

describe('applyMention', () => {
  it('заменяет запрос и ставит курсор после пробела', () => {
    expect(applyMention('hi @ан there', 6, 3, anna)).toEqual({ value: 'hi @anna_k  there', caret: 11 });
  });
});
