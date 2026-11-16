import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { users, type tasks } from '@/db/schema';
import { dmEnabled } from '@/domain/dmEvents';
import { buildStartParam, miniAppButton, miniAppLink, taskLinkButtons, type LinkButton } from '@/domain/links';
import { env } from '@/env';
import type { Status } from '@/domain/types';
import { displayName, taskBlockDm, taskBlockText, taskCreatedDm, taskCreatedText, taskMovedDm, taskMovedText, type PersonRef } from '@/telegram/messages';
import { replyInGroup, sendDm, sendWidgetDm } from '@/telegram/notifier';
import { buildWidget, type WidgetCard } from '@/telegram/widgetHtml';
import type { ChatRow } from './chats';
import { getUsers } from './users';

type TaskRow = typeof tasks.$inferSelect;

/** Личное уведомление: HTML-виджет с кнопками под ним; если Telegram его не принял — тот же смысл обычным текстом. */
async function sendTaskDm(userId: number, card: WidgetCard, fallbackHtml: string, buttons: LinkButton[]): Promise<void> {
  const result = await sendWidgetDm(userId, buildWidget(card), buttons);
  if (result === 'failed') await sendDm(userId, fallbackHtml, buttons);
}

export function taskUrl(chatId: number, taskNumber: number): string | undefined {
  const short = env.miniAppShortName;
  return short ? miniAppLink(env.botUsername, short, buildStartParam(chatId, taskNumber)) : undefined;
}

const taskButtons = (chat: ChatRow, taskNumber: number, sourceMessageId: number) =>
  taskLinkButtons({ botUsername: env.botUsername, shortName: env.miniAppShortName, chatId: chat.id, chatType: chat.type, taskNumber, sourceMessageId });

export function boardButton(chatId: number, taskNumber?: number): LinkButton | undefined {
  return miniAppButton(env.botUsername, env.miniAppShortName, chatId, taskNumber);
}

export async function notifyTaskCreated(p: {
  chat: ChatRow;
  taskNumber: number;
  text: string;
  deadline: string;
  sourceMessageId: number;
  authorId: number;
  assignees: { userId: number | null; username: string | null }[];
}): Promise<void> {
  const ids = p.assignees.flatMap((a) => (a.userId === null ? [] : [a.userId]));
  const known = await getUsers(ids);
  const byId = new Map(known.map((u) => [u.id, u]));
  const people: PersonRef[] = p.assignees.map((a) => {
    const u = a.userId !== null ? byId.get(a.userId) : undefined;
    return { userId: a.userId, username: u?.username ?? a.username, name: u ? displayName(u) : null };
  });

  await replyInGroup(p.chat.id, p.sourceMessageId, taskCreatedText(p.taskNumber, people), boardButton(p.chat.id, p.taskNumber));
  const [author] = await getUsers([p.authorId]);
  const card: WidgetCard = { board: p.chat.title, number: p.taskNumber, kind: 'created', text: p.text, deadline: p.deadline, who: author ? displayName(author) : '?', whoLabel: 'Поставил' };
  const dm = taskCreatedDm({ board: p.chat.title, number: p.taskNumber, text: p.text, deadline: p.deadline, authorName: author ? displayName(author) : '?', url: taskUrl(p.chat.id, p.taskNumber) });
  for (const u of dmEnabled(p.chat.dmOff, 'created') ? known : []) {
    if (u.startedBot && u.id !== p.authorId) {
      await sendTaskDm(u.id, card, dm, taskButtons(p.chat, p.taskNumber, p.sourceMessageId));
    }
  }
}

/** Смена колонки: личное сообщение автору и исполнителям (кроме того, кто перетащил). В группу reply уходит только при переносе в Done. */
export async function notifyTaskMoved(p: { task: TaskRow; chat: ChatRow; actorId: number; assigneeIds: number[]; from: Status; to: Status }): Promise<void> {
  const { task, chat } = p;
  const [actor] = await getDb().select().from(users).where(eq(users.id, p.actorId));
  const html = taskMovedText(task.number, actor ? displayName(actor) : '?', p.from, p.to, taskUrl(chat.id, task.number));
  if (p.to === 'done') await replyInGroup(chat.id, task.sourceMessageId, html, boardButton(chat.id, task.number));
  const dm = taskMovedDm({ board: chat.title, number: task.number, text: task.text, deadline: task.deadline, actorName: actor ? displayName(actor) : '?', from: p.from, to: p.to, url: taskUrl(chat.id, task.number) });
  const card: WidgetCard = { board: chat.title, number: task.number, kind: p.to === 'done' ? 'done' : 'moved', text: task.text, deadline: task.deadline, from: p.from, to: p.to, who: actor ? displayName(actor) : '?', whoLabel: 'Кто' };
  if (!dmEnabled(chat.dmOff, p.to === 'done' ? 'done' : 'moved')) return;
  const recipients = await getUsers([...new Set([task.authorId, ...p.assigneeIds])].filter((id) => id !== p.actorId));
  for (const u of recipients) {
    if (u.startedBot) await sendTaskDm(u.id, card, dm, taskButtons(chat, task.number, task.sourceMessageId));
  }
}

/** Задача заблокирована или разблокирована: сообщение в группу и личное сообщение автору и исполнителям (кроме того, кто нажал). */
export async function notifyTaskBlock(p: { task: TaskRow; chat: ChatRow; actorId: number; assigneeIds: number[]; blocked: boolean; reason: string | null }): Promise<void> {
  const { task, chat } = p;
  const [actor] = await getDb().select().from(users).where(eq(users.id, p.actorId));
  const html = taskBlockText(task.number, actor ? displayName(actor) : '?', p.blocked, p.reason, taskUrl(chat.id, task.number));
  await replyInGroup(chat.id, task.sourceMessageId, html, boardButton(chat.id, task.number));
  const dm = taskBlockDm({ board: chat.title, number: task.number, text: task.text, actorName: actor ? displayName(actor) : '?', blocked: p.blocked, reason: p.reason, url: taskUrl(chat.id, task.number) });
  const card: WidgetCard = { board: chat.title, number: task.number, kind: p.blocked ? 'blocked' : 'unblocked', text: task.text, who: actor ? displayName(actor) : '?', whoLabel: 'Кто', reason: p.reason };
  if (!dmEnabled(chat.dmOff, 'blocked')) return;
  const recipients = await getUsers([...new Set([task.authorId, ...p.assigneeIds])].filter((id) => id !== p.actorId));
  for (const u of recipients) {
    if (u.startedBot) await sendTaskDm(u.id, card, dm, taskButtons(chat, task.number, task.sourceMessageId));
  }
}
