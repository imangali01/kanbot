import { describe, expect, it } from 'vitest';
import { commentText, displayName, escapeHtml, formatDigest, mentionHtml, taskCreatedText, truncate } from './messages';

describe('messages', () => {
  it('escapes html', () => expect(escapeHtml('<b>&"</b>')).toBe('&lt;b&gt;&amp;"&lt;/b&gt;'));
  it('truncates with ellipsis', () => {
    expect(truncate('abcdef', 4)).toBe('abc…');
    expect(truncate('abc', 4)).toBe('abc');
  });
  it('display name', () => {
    expect(displayName({ firstName: 'Иван', lastName: 'Петров', username: 'ip' })).toBe('Иван Петров');
    expect(displayName({ firstName: '', lastName: null, username: 'ip' })).toBe('@ip');
  });
  it('mentions by username, by id link, or plain name', () => {
    expect(mentionHtml({ userId: 1, username: 'a_b', name: 'A' })).toBe('@a_b');
    expect(mentionHtml({ userId: 7, username: null, name: 'Иван <x>' })).toBe('<a href="tg://user?id=7">Иван &lt;x&gt;</a>');
  });
  it('task created text', () => {
    expect(taskCreatedText(12, [{ userId: null, username: 'laderlapen', name: null }])).toBe('✅ Задача #12 создана\nИсполнители: @laderlapen');
    expect(taskCreatedText(3, [])).toBe('✅ Задача #3 создана\nБез исполнителя');
  });
  it('comment is a quote block with the author in bold and escapes user input', () => {
    expect(commentText('Аня', 4, 'a<b')).toBe('💬 <b>Аня</b> · #4\n<blockquote>a&lt;b</blockquote>');
  });
  it('comment keeps line breaks inside the quote and escapes the author name', () => {
    expect(commentText('<Я>', 7, 'раз\nдва')).toBe('💬 <b>&lt;Я&gt;</b> · #7\n<blockquote>раз\nдва</blockquote>');
  });
  it('digest lists today and overdue', () => {
    const base = { id: 1, chatTitle: 'test', status: 'todo' as const, assigneeIds: [1] };
    const out = formatDigest({
      today: [{ ...base, number: 1, text: 'сегодня', deadline: '2026-10-02' }],
      overdue: [{ ...base, number: 2, text: 'старое', deadline: '2026-09-30' }],
    });
    expect(out).toContain('<b>Сегодня:</b>\n• #1 сегодня — test');
    expect(out).toContain('<b>Просрочено:</b>\n• #2 старое — test (до 30.09.2026)');
  });
});
