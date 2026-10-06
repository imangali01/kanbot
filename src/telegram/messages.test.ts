import { describe, expect, it } from 'vitest';
import { commentText, displayName, escapeHtml, formatDigest, helpText, mentionHtml, statusChangedDm, taskAssignedDm, taskCreatedText, ticketRef, truncate } from './messages';

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
    expect(taskCreatedText(12, [{ userId: null, username: 'laderlapen', name: null }])).toBe('✅ Задача SD-0012 создана\nИсполнители: @laderlapen');
    expect(taskCreatedText(3, [])).toBe('✅ Задача SD-0003 создана\nБез исполнителя');
  });
  it('comment is a quote block with the author in bold and escapes user input', () => {
    expect(commentText('Аня', 4, 'a<b')).toBe('<b>Аня</b> · SD-0004\na&lt;b');
  });
  it('comment is compact: author, ticket ID, then the text; keeps line breaks and escapes the author name', () => {
    expect(commentText('<Я>', 7, 'раз\nдва')).toBe('<b>&lt;Я&gt;</b> · SD-0007\nраз\nдва');
  });
  it('comment ticket ID opens the card when a link is given', () => {
    expect(commentText('Аня', 4, 'ок', [], 'https://t.me/bot/app?startapp=c-1_t4')).toBe('<b>Аня</b> · <a href="https://t.me/bot/app?startapp=c-1_t4">SD-0004</a>\nок');
  });
  it('comment turns mentions of members into Telegram mentions', () => {
    const members = [
      { userId: 1, username: 'anna_k', name: 'Анна Ким' },
      { userId: 2, username: null, name: 'Борис <Ли>' },
    ];
    expect(commentText('Аня', 4, '@anna_k и @Борис_<Ли> & @nobody', members)).toBe(
      '<b>Аня</b> · SD-0004\n@anna_k и @Борис_&lt;Ли&gt; &amp; @nobody',
    );
    expect(commentText('Аня', 4, 'эй @Борис_Ли', [{ userId: 2, username: null, name: 'Борис Ли' }])).toBe(
      '<b>Аня</b> · SD-0004\nэй <a href="tg://user?id=2">Борис Ли</a>',
    );
  });
  it('digest lists today and overdue', () => {
    const base = { id: 1, chatId: -1, chatTitle: 'test', status: 'todo' as const, assigneeIds: [1] };
    const out = formatDigest({
      today: [{ ...base, number: 1, text: 'сегодня', deadline: '2026-10-02' }],
      overdue: [{ ...base, number: 2, text: 'старое', deadline: '2026-09-30' }],
    });
    expect(out).toContain('<b>Сегодня:</b>\n• SD-0001 сегодня — test');
    expect(out).toContain('<b>Просрочено:</b>\n• SD-0002 старое — test (до 30.09.2026)');
  });
});

describe('ticketRef', () => {
  const url = 'https://t.me/bot/board?startapp=c-1_t4';
  it('без ссылки — обычный текст', () => {
    expect(ticketRef(4)).toBe('SD-0004');
  });
  it('со ссылкой — кликабельный номер', () => {
    expect(ticketRef(4, url)).toBe('<a href="https://t.me/bot/board?startapp=c-1_t4">SD-0004</a>');
  });
  it('номер кликабелен в личных сообщениях и дайджесте', () => {
    expect(taskAssignedDm(4, 'test', 'текст', '2026-10-07', url)).toContain('<a href="' + url + '">SD-0004</a>');
    expect(statusChangedDm('done', 4, 'test', 'текст', 'Аня', undefined, url)).toContain('выполнена');
    expect(statusChangedDm('done', 4, 'test', 'текст', 'Аня', undefined, url)).toContain('<a href="' + url + '">SD-0004</a>');
    const task = { id: 1, number: 4, text: 'x', chatId: -1, chatTitle: 'test', deadline: '2026-10-07', status: 'todo' as const, assigneeIds: [1] };
    expect(formatDigest({ today: [task], overdue: [] }, () => url)).toContain('• <a href="' + url + '">SD-0004</a> x');
  });
});

describe('helpText', () => {
  it('explains how to create a task and shows the ticket ID format', () => {
    const t = helpText({ isAdmin: false, inGroup: true });
    expect(t).toContain('/task @исполнитель текст задачи');
    expect(t).toContain('SD-0001');
    expect(t).toContain('/help');
  });
  it('mentions the admin panel only for admins', () => {
    expect(helpText({ isAdmin: true, inGroup: true })).toContain('Админка');
    expect(helpText({ isAdmin: false, inGroup: true })).not.toContain('Админка');
  });
  it('tells people in a private chat to add the bot to a group', () => {
    expect(helpText({ isAdmin: false, inGroup: false })).toContain('добавьте бота в рабочую группу');
    expect(helpText({ isAdmin: false, inGroup: true })).not.toContain('добавьте бота в рабочую группу');
  });
  it('fits into one Telegram message', () => {
    expect(helpText({ isAdmin: true, inGroup: false }).length).toBeLessThan(4096);
  });
});
