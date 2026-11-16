import { formatDateRu } from '@/domain/dates';
import { splitMentions, type MentionMember } from '@/domain/mentions';
import { ticketId } from '@/domain/ticketId';
import { STATUS_TITLES, type Status } from '@/domain/types';
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

const STATUS_DOT: Record<Status, string> = { todo: '⚪', in_progress: '🟡', done: '🟢' };
const statusLabel = (st: Status) => `${STATUS_DOT[st]} ${STATUS_TITLES[st]}`;

/**
 * Личное уведомление — «виджет»: сверху доска (в личке иначе не понять, откуда пришло), затем событие и номер,
 * текст задачи цитатой и короткие факты. Значения фактов — обычный текст, экранируются здесь.
 */
export interface DmWidget {
  board: string;
  icon: string;
  title: string;
  number: number;
  url?: string;
  text: string;
  facts: Array<[label: string, value: string]>;
}

export function dmWidget(w: DmWidget): string {
  return [
    `🗂 <b>${escapeHtml(truncate(w.board || 'Без названия', 60))}</b>`,
    `${w.icon} ${w.title} · ${ticketRef(w.number, w.url)}`,
    '',
    `<blockquote>${escapeHtml(truncate(w.text, 240))}</blockquote>`,
    ...w.facts.map(([label, value]) => `<i>${label}:</i> ${escapeHtml(truncate(value, 200))}`),
  ].join('\n');
}

export function taskCreatedDm(p: { board: string; number: number; text: string; deadline: string; authorName: string; url?: string }): string {
  return dmWidget({
    board: p.board, icon: '🆕', title: '<b>Новая задача для вас</b>', number: p.number, url: p.url, text: p.text,
    facts: [['Срок', formatDateRu(p.deadline)], ['Поставил', p.authorName]],
  });
}

export function taskMovedDm(p: { board: string; number: number; text: string; deadline: string; actorName: string; from: Status; to: Status; url?: string }): string {
  return dmWidget({
    board: p.board, icon: p.to === 'done' ? '✅' : '🔀', title: p.to === 'done' ? '<b>Задача выполнена</b>' : '<b>Задача перенесена</b>', number: p.number, url: p.url, text: p.text,
    facts: [['Статус', `${statusLabel(p.from)} → ${statusLabel(p.to)}`], ['Срок', formatDateRu(p.deadline)], ['Кто', p.actorName]],
  });
}

export function taskBlockDm(p: { board: string; number: number; text: string; actorName: string; blocked: boolean; reason: string | null; url?: string }): string {
  const facts: DmWidget['facts'] = [];
  if (p.reason) facts.push([p.blocked ? 'Причина' : 'Блок был из-за', p.reason]);
  facts.push(['Кто', p.actorName]);
  return dmWidget({
    board: p.board, icon: p.blocked ? '⛔' : '🔓', title: p.blocked ? '<b>Задача заблокирована</b>' : '<b>Задача разблокирована</b>', number: p.number, url: p.url, text: p.text, facts,
  });
}

export function taskBlockText(number: number, actorName: string, blocked: boolean, reason: string | null, url?: string): string {
  const head = blocked ? `⛔ Задача ${ticketRef(number, url)} заблокирована` : `🔓 Задача ${ticketRef(number, url)} разблокирована`;
  const lines = [head];
  if (reason) lines.push(`${blocked ? 'Причина' : 'Блок был из-за'}: ${escapeHtml(truncate(reason, 300))}`);
  lines.push(`Кто: ${escapeHtml(actorName)}`);
  return lines.join('\n');
}

export function taskMovedText(number: number, actorName: string, from: Status, to: Status, url?: string): string {
  const head = to === 'done' ? `✅ Задача ${ticketRef(number, url)} выполнена` : `🔀 Задача ${ticketRef(number, url)} перенесена`;
  return [head, `${STATUS_TITLES[from]} → ${STATUS_TITLES[to]}`, `Кто: ${escapeHtml(actorName)}`].join('\n');
}

export function commentText(authorName: string, number: number, text: string, members: MentionMember[] = [], url?: string): string {
  const body = splitMentions(text, members)
    .map((seg) => (seg.type === 'text' ? escapeHtml(seg.text) : mentionHtml(seg.member)))
    .join('');
  return `💬 <b>${escapeHtml(authorName)}</b> · ${ticketRef(number, url)}\n\n${body}`;
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
export const ADMIN_REQUEST_TEXT =
  '👋 Чтобы я заработал в этой группе, сделайте меня <b>администратором</b>:\nинформация о группе → «Администраторы» → «Добавить администратора» → выберите меня.\nПока я не админ, задачи через /task не создаются.';
export const ADMIN_THANKS_TEXT = '✅ Спасибо, теперь я готов к работе. Поставить задачу: <code>/task @user текст</code>, справка — /help.';
export const NO_RIGHTS_TEXT = 'Нет прав на создание задач в этом чате.';
export const START_TEXT = 'Привет! Я буду присылать сюда уведомления о ваших задачах и дедлайнах.\nЗадачу на доске группы открывайте кнопкой «Открыть карточку» под сообщениями бота в группе.\nКак ставить задачи и пользоваться доской: /help';

export function helpText(opts: { isAdmin: boolean; inGroup: boolean }): string {
  const lines = [
    '<b>kanbot — задачи прямо в чате</b>',
    '',
    '<b>Поставить задачу</b>',
    '<code>/task @исполнитель текст задачи</code>',
    'Или ответьте на нужное сообщение командой <code>/task @исполнитель</code>: его текст станет задачей. Исполнителей может быть несколько. Если у человека нет username, выберите его из подсказки после «@».',
    '',
    '<b>Доска</b>',
    'У каждой задачи есть ID вида SD-0001. Кнопка «Открыть карточку» под ответом бота открывает задачу на доске. В ней колонки Todo, In progress и Done, карточки перетаскиваются. В карточке срок (по умолчанию завтра), сложность звёздами, исполнители и комментарии. Задачу можно заблокировать, указав причину.',
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
