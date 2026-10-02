import { describe, expect, it } from 'vitest';
import { parseTaskCommand, type IncomingMessage } from './parseTaskCommand';

const BOT = 't8981_bot';
const cmd = (len = 5) => ({ type: 'bot_command', offset: 0, length: len });

describe('parseTaskCommand', () => {
  it('parses /task @user text', () => {
    const text = '/task @Laderlapen мониторинг показателей поменяй на 8:40 и 9:40';
    const r = parseTaskCommand({ message_id: 10, text, entities: [cmd(), { type: 'mention', offset: 6, length: 11 }] }, BOT);
    expect(r).toEqual({ ok: true, text: 'мониторинг показателей поменяй на 8:40 и 9:40', assignees: [{ kind: 'username', username: 'laderlapen' }], sourceMessageId: 10 });
  });

  it('accepts /task@bot suffix (case-insensitive) and several assignees', () => {
    const text = '/task@T8981_bot @a1 @b2 текст';
    const r = parseTaskCommand({ message_id: 1, text, entities: [cmd(15), { type: 'mention', offset: 16, length: 3 }, { type: 'mention', offset: 20, length: 3 }] }, BOT);
    expect(r.ok && r.assignees).toEqual([{ kind: 'username', username: 'a1' }, { kind: 'username', username: 'b2' }]);
    expect(r.ok && r.text).toBe('текст');
  });

  it('ignores command addressed to another bot', () => {
    const text = '/task@other_bot текст';
    expect(parseTaskCommand({ message_id: 1, text, entities: [cmd(15)] }, BOT)).toEqual({ ok: false, reason: 'not_command' });
  });

  it('ignores /task not at the start', () => {
    const text = 'привет /task @a текст';
    expect(parseTaskCommand({ message_id: 1, text, entities: [{ type: 'bot_command', offset: 7, length: 5 }] }, BOT)).toEqual({ ok: false, reason: 'not_command' });
  });

  it('ignores other commands', () => {
    expect(parseTaskCommand({ message_id: 1, text: '/start', entities: [cmd(6)] }, BOT)).toEqual({ ok: false, reason: 'not_command' });
  });

  it('supports text_mention (user without username)', () => {
    const user = { id: 42, first_name: 'Иван' };
    const text = '/task Иван сделай отчёт';
    const r = parseTaskCommand({ message_id: 1, text, entities: [cmd(), { type: 'text_mention', offset: 6, length: 4, user }] }, BOT);
    expect(r).toEqual({ ok: true, text: 'сделай отчёт', assignees: [{ kind: 'user', user }], sourceMessageId: 1 });
  });

  it('dedupes assignees and skips the bot itself', () => {
    const text = '/task @a1 @A1 @t8981_bot задача';
    const r = parseTaskCommand({ message_id: 1, text, entities: [cmd(), { type: 'mention', offset: 6, length: 3 }, { type: 'mention', offset: 10, length: 3 }, { type: 'mention', offset: 14, length: 10 }] }, BOT);
    expect(r.ok && r.assignees).toEqual([{ kind: 'username', username: 'a1' }]);
    expect(r.ok && r.text).toBe('задача');
  });

  it('allows no assignees', () => {
    const r = parseTaskCommand({ message_id: 1, text: '/task купить воду', entities: [cmd()] }, BOT);
    expect(r).toEqual({ ok: true, text: 'купить воду', assignees: [], sourceMessageId: 1 });
  });

  it('handles UTF-16 offsets after emoji', () => {
    const text = '/task 🔥 @ivan срочно';
    const r = parseTaskCommand({ message_id: 1, text, entities: [cmd(), { type: 'mention', offset: 9, length: 5 }] }, BOT);
    expect(r).toEqual({ ok: true, text: '🔥 срочно', assignees: [{ kind: 'username', username: 'ivan' }], sourceMessageId: 1 });
  });

  it('reply: takes text of replied message, appends extra words, points to original', () => {
    const reply: IncomingMessage = { message_id: 5, text: 'мониторинг показателей поменяй на 8:40' };
    const r = parseTaskCommand({ message_id: 6, text: '/task @a1 до обеда', entities: [cmd(), { type: 'mention', offset: 6, length: 3 }], reply_to_message: reply }, BOT);
    expect(r).toEqual({ ok: true, text: 'мониторинг показателей поменяй на 8:40\nдо обеда', assignees: [{ kind: 'username', username: 'a1' }], sourceMessageId: 5 });
  });

  it('reply: uses caption of a photo message', () => {
    const r = parseTaskCommand({ message_id: 6, text: '/task', entities: [cmd()], reply_to_message: { message_id: 5, caption: 'подпись к фото' } }, BOT);
    expect(r.ok && r.text).toBe('подпись к фото');
  });

  it('empty text without reply', () => {
    expect(parseTaskCommand({ message_id: 1, text: '/task @a1', entities: [cmd(), { type: 'mention', offset: 6, length: 3 }] }, BOT)).toEqual({ ok: false, reason: 'empty_text' });
  });

  it('keeps line breaks, collapses spaces', () => {
    const r = parseTaskCommand({ message_id: 1, text: '/task  первая   строка\nвторая', entities: [cmd()] }, BOT);
    expect(r.ok && r.text).toBe('первая строка\nвторая');
  });
});
