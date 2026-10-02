import { formatDateRu } from '@/domain/dates';
import type { Digest, DigestTask } from '@/domain/digest';

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

export function displayName(u: { firstName: string; lastName: string | null; username: string | null }): string {
  const full = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
  if (full) return full;
  return u.username ? `@${u.username}` : 'Без имени';
}

export interface PersonRef { userId: number | null; username: string | null; name: string | null }

export function mentionHtml(p: PersonRef): string {
  if (p.username) return `@${escapeHtml(p.username)}`;
  if (p.userId !== null) return `<a href="tg://user?id=${p.userId}">${escapeHtml(p.name ?? 'пользователь')}</a>`;
  return escapeHtml(p.name ?? '?');
}

export function taskCreatedText(number: number, assignees: PersonRef[]): string {
  const who = assignees.length ? `Исполнители: ${assignees.map(mentionHtml).join(', ')}` : 'Без исполнителя';
  return `✅ Задача #${number} создана\n${who}`;
}

export function taskAssignedDm(number: number, chatTitle: string, text: string, deadline: string): string {
  return [`📝 Новая задача #${number} — ${escapeHtml(chatTitle)}`, escapeHtml(truncate(text, 300)), `Дедлайн: ${formatDateRu(deadline)}`].join('\n');
}

export function statusChangedDm(
  kind: 'done' | 'blocked',
  number: number,
  chatTitle: string,
  text: string,
  actorName: string,
  reason?: string,
): string {
  const head = kind === 'done' ? `✅ Задача #${number} выполнена` : `⛔ Задача #${number} заблокирована`;
  const lines = [`${head} — ${escapeHtml(chatTitle)}`, escapeHtml(truncate(text, 200)), `Кто: ${escapeHtml(actorName)}`];
  if (kind === 'blocked' && reason) lines.push(`Причина: ${escapeHtml(reason)}`);
  return lines.join('\n');
}

export function commentText(authorName: string, number: number, text: string): string {
  return `💬 <b>${escapeHtml(authorName)}</b> · #${number}\n<blockquote>${escapeHtml(text)}</blockquote>`;
}

export function pingText(number: number): string {
  return `📌 Задача #${number}`;
}

export function loginCodeText(code: string): string {
  return `Код входа в админку kanbot: <b>${code}</b>\nДействует 5 минут.`;
}

export function formatDigest(d: Digest): string {
  const line = (t: DigestTask, withDate: boolean) =>
    `• #${t.number} ${escapeHtml(truncate(t.text, 80))} — ${escapeHtml(t.chatTitle)}${withDate ? ` (до ${formatDateRu(t.deadline)})` : ''}`;
  const parts = ['☀️ <b>Дедлайны</b>'];
  if (d.today.length) parts.push('', '<b>Сегодня:</b>', ...d.today.map((t) => line(t, false)));
  if (d.overdue.length) parts.push('', '<b>Просрочено:</b>', ...d.overdue.map((t) => line(t, true)));
  return parts.join('\n');
}

export const USAGE_TEXT = 'Формат: <code>/task @user текст задачи</code>\nили ответьте на сообщение: <code>/task @user</code>';
export const NO_RIGHTS_TEXT = 'Нет прав на создание задач в этом чате.';
export const START_TEXT = 'Привет! Я буду присылать сюда уведомления о ваших задачах и дедлайнах.\nДоску группы открывайте кнопкой «Открыть доску» под сообщениями бота в группе.';
