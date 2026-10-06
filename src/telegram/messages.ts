import { formatDateRu } from '@/domain/dates';
import { splitMentions, type MentionMember } from '@/domain/mentions';
import { ticketId } from '@/domain/ticketId';
import type { Digest, DigestTask } from '@/domain/digest';

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

export function displayName(u: { firstName: string; lastName: string | null; username: string | null; displayName?: string | null }): string {
  if (u.displayName) return u.displayName;
  const full = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
  if (full) return full;
  return u.username ? `@${u.username}` : 'Без имени';
}

/** Номер задачи; со ссылкой он кликабельный и открывает карточку в Mini App. */
export function ticketRef(number: number, url?: string): string {
  const id = ticketId(number);
  return url ? `<a href="${escapeHtml(url).replace(/"/g, '&quot;')}">${id}</a>` : id;
}

export interface PersonRef { userId: number | null; username: string | null; name: string | null }

export function mentionHtml(p: PersonRef): string {
  if (p.username) return `@${escapeHtml(p.username)}`;
  if (p.userId !== null) return `<a href="tg://user?id=${p.userId}">${escapeHtml(p.name ?? 'пользователь')}</a>`;
  return escapeHtml(p.name ?? '?');
}

export function taskCreatedText(number: number, assignees: PersonRef[]): string {
  const who = assignees.length ? `Исполнители: ${assignees.map(mentionHtml).join(', ')}` : 'Без исполнителя';
  return `✅ Задача ${ticketId(number)} создана\n${who}`;
}

export function taskAssignedDm(number: number, chatTitle: string, text: string, deadline: string, url?: string): string {
  return [`📝 Новая задача ${ticketRef(number, url)} — ${escapeHtml(chatTitle)}`, escapeHtml(truncate(text, 300)), `Дедлайн: ${formatDateRu(deadline)}`].join('\n');
}

export function statusChangedDm(
  kind: 'done' | 'blocked',
  number: number,
  chatTitle: string,
  text: string,
  actorName: string,
  reason?: string,
  url?: string,
): string {
  const head = kind === 'done' ? `✅ Задача ${ticketRef(number, url)} выполнена` : `⛔ Задача ${ticketRef(number, url)} заблокирована`;
  const lines = [`${head} — ${escapeHtml(chatTitle)}`, escapeHtml(truncate(text, 200)), `Кто: ${escapeHtml(actorName)}`];
  if (kind === 'blocked' && reason) lines.push(`Причина: ${escapeHtml(reason)}`);
  return lines.join('\n');
}

export function commentText(authorName: string, number: number, text: string, members: MentionMember[] = []): string {
  const body = splitMentions(text, members)
    .map((seg) => (seg.type === 'text' ? escapeHtml(seg.text) : mentionHtml(seg.member)))
    .join('');
  return `💬 <b>${escapeHtml(authorName)}</b> · ${ticketId(number)}\n<blockquote>${body}</blockquote>`;
}

export function pingText(number: number): string {
  return `📌 Задача ${ticketId(number)}`;
}

export function loginCodeText(code: string): string {
  return `Код входа в админку kanbot: <b>${code}</b>\nДействует 5 минут.`;
}

export function formatDigest(d: Digest, urlFor?: (t: DigestTask) => string | undefined): string {
  const line = (t: DigestTask, withDate: boolean) =>
    `• ${ticketRef(t.number, urlFor?.(t))} ${escapeHtml(truncate(t.text, 80))} — ${escapeHtml(t.chatTitle)}${withDate ? ` (до ${formatDateRu(t.deadline)})` : ''}`;
  const parts = ['☀️ <b>Дедлайны</b>'];
  if (d.today.length) parts.push('', '<b>Сегодня:</b>', ...d.today.map((t) => line(t, false)));
  if (d.overdue.length) parts.push('', '<b>Просрочено:</b>', ...d.overdue.map((t) => line(t, true)));
  return parts.join('\n');
}

export const USAGE_TEXT = 'Формат: <code>/task @user текст задачи</code>\nили ответьте на сообщение: <code>/task @user</code>';
export const NO_RIGHTS_TEXT = 'Нет прав на создание задач в этом чате.';
export const START_TEXT = 'Привет! Я буду присылать сюда уведомления о ваших задачах и дедлайнах.\nДоску группы открывайте кнопкой «Открыть доску» под сообщениями бота в группе.\nКак ставить задачи и пользоваться доской: /help';

export function helpText(opts: { isAdmin: boolean; inGroup: boolean }): string {
  const lines = [
    '<b>kanbot — задачи прямо в чате</b>',
    '',
    '<b>Поставить задачу</b>',
    '<code>/task @исполнитель текст задачи</code>',
    'Или ответьте на нужное сообщение командой <code>/task @исполнитель</code>: его текст станет задачей. Исполнителей может быть несколько. Если у человека нет username, выберите его из подсказки после «@».',
    '',
    '<b>Доска</b>',
    'У каждой задачи есть ID вида SD-0001. Доска открывается кнопкой «Открыть доску» под ответом бота. В ней колонки Todo, In progress и Done, карточки перетаскиваются. В карточке срок (по умолчанию завтра), сложность звёздами, исполнители и комментарии. Задачу можно заблокировать, указав причину.',
    '',
    '<b>Комментарии</b>',
    'Комментарий из приложения бот публикует в чате цитатой к исходному сообщению задачи.',
    '',
    '<b>Уведомления</b>',
    'Личные сообщения (новая задача, смена статуса, дайджест сроков в 09:00) приходят тем, кто нажал /start у бота.',
  ];
  if (!opts.inGroup) lines.push('', 'Чтобы начать, добавьте бота в рабочую группу: админ подключит её к доске.');
  if (opts.isAdmin) lines.push('', '<b>Для админа</b>', 'В приложении на экране «Доски» есть кнопка «Админка»: подключение групп и права на постановку задач.');
  lines.push('', '<b>Команды</b>', '/task — поставить задачу', '/help — эта справка', '/start — включить личные уведомления');
  return lines.join('\n');
}
