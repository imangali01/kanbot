import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { users, type tasks } from '@/db/schema';
import { buildStartParam, miniAppLink, taskLinkButtons } from '@/domain/links';
import { env } from '@/env';
import type { Status } from '@/domain/types';
import { displayName, statusChangedDm, taskAssignedDm, taskCreatedText, taskMovedText, type PersonRef } from '@/telegram/messages';
import { replyInGroup, sendDm } from '@/telegram/notifier';
import type { ChatRow } from './chats';
import { getUsers } from './users';

type TaskRow = typeof tasks.$inferSelect;

export function taskUrl(chatId: number, taskNumber: number): string | undefined {
  const short = env.miniAppShortName;
  return short ? miniAppLink(env.botUsername, short, buildStartParam(chatId, taskNumber)) : undefined;
}

const taskButtons = (chat: ChatRow, taskNumber: number, sourceMessageId: number) =>
  taskLinkButtons({ botUsername: env.botUsername, shortName: env.miniAppShortName, chatId: chat.id, chatType: chat.type, taskNumber, sourceMessageId });

export function boardButton(chatId: number, taskNumber?: number): { text: string; url: string } | undefined {
  const short = env.miniAppShortName;
  if (!short) return undefined;
  return { text: 'Открыть доску', url: miniAppLink(env.botUsername, short, buildStartParam(chatId, taskNumber)) };
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
  for (const u of known) {
    if (u.startedBot && u.id !== p.authorId) {
      await sendDm(u.id, taskAssignedDm(p.taskNumber, p.chat.title, p.text, p.deadline, taskUrl(p.chat.id, p.taskNumber)), taskButtons(p.chat, p.taskNumber, p.sourceMessageId));
    }
  }
}

/** Смена колонки: личное сообщение автору и исполнителям (кроме того, кто перетащил). В группу reply уходит только при переносе в Done. */
export async function notifyTaskMoved(p: { task: TaskRow; chat: ChatRow; actorId: number; assigneeIds: number[]; from: Status; to: Status }): Promise<void> {
  const { task, chat } = p;
  const [actor] = await getDb().select().from(users).where(eq(users.id, p.actorId));
  const html = taskMovedText(task.number, actor ? displayName(actor) : '?', p.from, p.to, taskUrl(chat.id, task.number));
  if (p.to === 'done') await replyInGroup(chat.id, task.sourceMessageId, html);
  const recipients = await getUsers([...new Set([task.authorId, ...p.assigneeIds])].filter((id) => id !== p.actorId));
  for (const u of recipients) {
    if (u.startedBot) await sendDm(u.id, html, taskButtons(chat, task.number, task.sourceMessageId));
  }
}

export async function notifyAuthorStatus(
  task: TaskRow,
  chat: ChatRow,
  actorId: number,
  kind: 'done' | 'blocked',
  reason?: string,
): Promise<void> {
  if (task.authorId === actorId) return;
  const db = getDb();
  const [author] = await db.select().from(users).where(eq(users.id, task.authorId));
  if (!author?.startedBot) return;
  const [actor] = await db.select().from(users).where(eq(users.id, actorId));
  await sendDm(author.id, statusChangedDm(kind, task.number, chat.title, task.text, actor ? displayName(actor) : '?', reason, taskUrl(chat.id, task.number)), taskButtons(chat, task.number, task.sourceMessageId));
}
