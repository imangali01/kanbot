import { and, eq, inArray, isNotNull, lte, ne } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { chats, taskAssignees, tasks, users } from '@/db/schema';
import { localDate } from '@/domain/dates';
import { buildDigests } from '@/domain/digest';
import type { Status } from '@/domain/types';
import { formatDigest } from '@/telegram/messages';
import { sendDm } from '@/telegram/notifier';
import { taskUrl } from './notifications';

export async function sendDailyDigests(now: Date): Promise<number> {
  const db = getDb();
  const today = localDate(now);
  const rows = await db
    .select({ id: tasks.id, number: tasks.number, text: tasks.text, chatId: chats.id, deadline: tasks.deadline, status: tasks.status, chatTitle: chats.title })
    .from(tasks)
    .innerJoin(chats, eq(chats.id, tasks.chatId))
    .where(and(eq(chats.status, 'enabled'), ne(tasks.status, 'done'), lte(tasks.deadline, today)));
  if (rows.length === 0) return 0;

  const links = await db
    .select({ taskId: taskAssignees.taskId, userId: taskAssignees.userId })
    .from(taskAssignees)
    .where(and(inArray(taskAssignees.taskId, rows.map((r) => r.id)), isNotNull(taskAssignees.userId)));
  const byTask = new Map<number, number[]>();
  for (const l of links) byTask.set(l.taskId, [...(byTask.get(l.taskId) ?? []), l.userId as number]);

  const digests = buildDigests(rows.map((r) => ({ ...r, status: r.status as Status, assigneeIds: byTask.get(r.id) ?? [] })), today);
  if (digests.size === 0) return 0;

  const recipients = await db.select().from(users).where(and(inArray(users.id, [...digests.keys()]), eq(users.startedBot, true)));
  let sent = 0;
  for (const u of recipients) {
    const digest = digests.get(u.id);
    if (digest && (await sendDm(u.id, formatDigest(digest, (t) => taskUrl(t.chatId, t.number))))) sent++;
  }
  return sent;
}
