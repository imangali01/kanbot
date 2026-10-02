import { and, asc, eq, gte, inArray, ne, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { chats, comments, taskAssignees, tasks, users } from '@/db/schema';
import { analyticsSince, buildAnalytics, type ClosedTask } from '@/domain/analytics';
import { tomorrow } from '@/domain/dates';
import { supergroupMessageLink } from '@/domain/links';
import { placeCard, topPosition } from '@/domain/ordering';
import type { AssigneeRef } from '@/domain/parseTaskCommand';
import { canComment, canDelete, canEdit, canEditText, canView, type Actor, type TaskAccessRef } from '@/domain/permissions';
import type { AnalyticsDays, AnalyticsView, AssigneeView, BoardView, CardView, CommentView, Status, TaskDetail } from '@/domain/types';
import { commentText, displayName, pingText } from '@/telegram/messages';
import { deleteMessage, replyInGroup } from '@/telegram/notifier';
import { getActor, getChat, listMembers, type ChatRow } from './chats';
import { AccessError } from './errors';
import { notifyAuthorStatus } from './notifications';
import { findUserByUsername, upsertUser } from './users';

export type TaskRow = typeof tasks.$inferSelect;
export interface TaskPatch { text?: string; stars?: number; deadline?: string; assigneeKeys?: string[] }
type AssigneeRow = { userId: number | null; username: string | null };
interface CardItem { row: TaskRow; assignees: AssigneeView[]; authorName: string }

const unknownUser = { firstName: '?', lastName: null, username: null };

async function fetchCards(chatId: number, taskIds?: number[], doneSince?: Date): Promise<CardItem[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(tasks)
    .where(and(
      eq(tasks.chatId, chatId),
      taskIds ? inArray(tasks.id, taskIds) : undefined,
      doneSince ? and(eq(tasks.status, 'done'), gte(tasks.doneAt, doneSince)) : undefined,
    ));
  if (rows.length === 0) return [];

  const assigneeRows = await db
    .select({ taskId: taskAssignees.taskId, userId: taskAssignees.userId, username: taskAssignees.username, user: users })
    .from(taskAssignees)
    .leftJoin(users, eq(users.id, taskAssignees.userId))
    .where(inArray(taskAssignees.taskId, rows.map((r) => r.id)));
  const authors = await db.select().from(users).where(inArray(users.id, [...new Set(rows.map((r) => r.authorId))]));
  const authorById = new Map(authors.map((a) => [a.id, a]));

  const byTask = new Map<number, AssigneeView[]>();
  for (const a of assigneeRows) {
    const view: AssigneeView =
      a.userId !== null
        ? { key: `u:${a.userId}`, userId: a.userId, username: a.user?.username ?? null, name: displayName(a.user ?? unknownUser) }
        : { key: `n:${a.username}`, userId: null, username: a.username, name: `@${a.username}` };
    byTask.set(a.taskId, [...(byTask.get(a.taskId) ?? []), view]);
  }
  return rows.map((row) => ({
    row,
    assignees: byTask.get(row.id) ?? [],
    authorName: displayName(authorById.get(row.authorId) ?? unknownUser),
  }));
}

function accessRef(item: CardItem): TaskAccessRef {
  return { authorId: item.row.authorId, assigneeIds: item.assignees.flatMap((a) => (a.userId === null ? [] : [a.userId])) };
}

function toCardView(item: CardItem, actor: Actor): CardView {
  const { row } = item;
  const ref = accessRef(item);
  return {
    id: row.id,
    number: row.number,
    text: row.text,
    status: row.status as Status,
    position: row.position,
    stars: row.stars,
    deadline: row.deadline,
    blocked: row.blocked,
    blockedReason: row.blockedReason,
    createdAt: row.createdAt.toISOString(),
    doneAt: row.doneAt?.toISOString() ?? null,
    authorId: row.authorId,
    authorName: item.authorName,
    assignees: item.assignees,
    canEdit: canEdit(actor, ref),
    canEditText: canEditText(actor, ref),
    canDelete: canDelete(actor, ref),
  };
}

async function resolveRefs(refs: AssigneeRef[]): Promise<AssigneeRow[]> {
  const out: AssigneeRow[] = [];
  const seen = new Set<number>();
  for (const ref of refs) {
    if (ref.kind === 'user') {
      await upsertUser(ref.user);
      if (!seen.has(ref.user.id)) out.push({ userId: ref.user.id, username: null });
      seen.add(ref.user.id);
    } else {
      const user = await findUserByUsername(ref.username);
      if (user && seen.has(user.id)) continue;
      if (user) seen.add(user.id);
      out.push(user ? { userId: user.id, username: null } : { userId: null, username: ref.username });
    }
  }
  return out;
}

async function resolveKeys(keys: string[]): Promise<AssigneeRow[]> {
  const out: AssigneeRow[] = [];
  const seen = new Set<number>();
  const ids = keys.filter((k) => k.startsWith('u:')).map((k) => Number(k.slice(2)));
  const existing = ids.length ? await getDb().select({ id: users.id }).from(users).where(inArray(users.id, ids)) : [];
  const existingIds = new Set(existing.map((u) => u.id));
  for (const key of keys) {
    if (key.startsWith('u:')) {
      const id = Number(key.slice(2));
      if (existingIds.has(id) && !seen.has(id)) out.push({ userId: id, username: null });
      seen.add(id);
    } else {
      const username = key.slice(2);
      const user = await findUserByUsername(username);
      if (user && seen.has(user.id)) continue;
      if (user) seen.add(user.id);
      out.push(user ? { userId: user.id, username: null } : { userId: null, username });
    }
  }
  return out;
}

export async function createTask(input: {
  chat: ChatRow;
  authorId: number;
  text: string;
  assignees: AssigneeRef[];
  sourceMessageId: number;
  now: Date;
}): Promise<{ id: number; number: number; deadline: string; assignees: AssigneeRow[] }> {
  const assignees = await resolveRefs(input.assignees);
  const deadline = tomorrow(input.now);
  const db = getDb();
  const created = await db.transaction(async (tx) => {
    const [counter] = await tx
      .update(chats)
      .set({ nextTaskNumber: sql`${chats.nextTaskNumber} + 1` })
      .where(eq(chats.id, input.chat.id))
      .returning({ next: chats.nextTaskNumber });
    const number = counter.next - 1;
    const todo = await tx
      .select({ position: tasks.position })
      .from(tasks)
      .where(and(eq(tasks.chatId, input.chat.id), eq(tasks.status, 'todo')));
    const [task] = await tx
      .insert(tasks)
      .values({
        chatId: input.chat.id,
        number,
        text: input.text,
        status: 'todo',
        position: topPosition(todo.map((t) => t.position)),
        stars: 1,
        deadline,
        authorId: input.authorId,
        sourceMessageId: input.sourceMessageId,
      })
      .returning({ id: tasks.id });
    if (assignees.length) await tx.insert(taskAssignees).values(assignees.map((a) => ({ taskId: task.id, ...a })));
    return { id: task.id, number };
  });
  return { ...created, deadline, assignees };
}

export async function loadBoard(chat: ChatRow, actor: Actor): Promise<BoardView> {
  const [items, members] = await Promise.all([fetchCards(chat.id), listMembers(chat.id)]);
  return {
    chat: { id: chat.id, title: chat.title, type: chat.type },
    me: { userId: actor.userId, canCreate: actor.isCreator },
    members: members.map((m) => ({ key: `u:${m.id}`, userId: m.id, username: m.username, name: displayName(m) })),
    cards: items.map((i) => toCardView(i, actor)),
  };
}

async function loadContext(taskId: number, userId: number) {
  const [task] = await getDb().select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) throw new AccessError(404, 'Задача не найдена');
  const chat = await getChat(task.chatId);
  if (!chat || chat.status !== 'enabled') throw new AccessError(404, 'Доска недоступна');
  const actor = await getActor(chat, userId);
  if (!canView(actor)) throw new AccessError(403, 'Нет доступа к этой доске');
  const [item] = await fetchCards(chat.id, [taskId]);
  return { task, chat, actor, item, ref: accessRef(item) };
}

async function loadComments(taskId: number): Promise<CommentView[]> {
  const rows = await getDb()
    .select({ c: comments, author: users })
    .from(comments)
    .leftJoin(users, eq(users.id, comments.authorId))
    .where(eq(comments.taskId, taskId))
    .orderBy(asc(comments.createdAt), asc(comments.id));
  return rows.map(({ c, author }) => ({
    id: c.id,
    kind: c.kind as CommentView['kind'],
    text: c.text,
    authorName: author ? displayName(author) : null,
    createdAt: c.createdAt.toISOString(),
  }));
}

export async function getTaskDetail(taskId: number, userId: number): Promise<TaskDetail> {
  const ctx = await loadContext(taskId, userId);
  return { card: toCardView(ctx.item, ctx.actor), comments: await loadComments(taskId) };
}

export async function moveTask(taskId: number, userId: number, input: { status: Status; aboveId: number | null }): Promise<BoardView> {
  const ctx = await loadContext(taskId, userId);
  if (!canEdit(ctx.actor, ctx.ref)) throw new AccessError(403, 'Нет прав двигать эту карточку');
  const prev = ctx.task.status as Status;
  const now = new Date();
  const unblock = input.status === 'done' && ctx.task.blocked;

  await getDb().transaction(async (tx) => {
    const column = await tx
      .select({ id: tasks.id, position: tasks.position })
      .from(tasks)
      .where(and(eq(tasks.chatId, ctx.chat.id), eq(tasks.status, input.status), ne(tasks.id, taskId)))
      .orderBy(asc(tasks.position), asc(tasks.id));
    for (const u of placeCard(column, taskId, input.aboveId)) {
      if (u.id !== taskId) {
        await tx.update(tasks).set({ position: u.position }).where(eq(tasks.id, u.id));
        continue;
      }
      await tx
        .update(tasks)
        .set({
          position: u.position,
          status: input.status,
          updatedAt: now,
          doneAt: input.status === 'done' ? (prev === 'done' ? ctx.task.doneAt : now) : null,
          ...(unblock ? { blocked: false, blockedReason: null } : {}),
        })
        .where(eq(tasks.id, taskId));
    }
    if (unblock) {
      await tx.insert(comments).values({ taskId, authorId: null, kind: 'system', text: `Разблокировано. Причина была: ${ctx.task.blockedReason ?? ''}` });
    }
  });

  if (input.status === 'done' && prev !== 'done') await notifyAuthorStatus(ctx.task, ctx.chat, userId, 'done');
  return loadBoard(ctx.chat, ctx.actor);
}

export async function updateTask(taskId: number, userId: number, patch: TaskPatch): Promise<TaskDetail> {
  const ctx = await loadContext(taskId, userId);
  if (patch.text !== undefined && !canEditText(ctx.actor, ctx.ref)) throw new AccessError(403, 'Нет прав менять текст');
  const touchesFields = patch.stars !== undefined || patch.deadline !== undefined || patch.assigneeKeys !== undefined;
  if (touchesFields && !canEdit(ctx.actor, ctx.ref)) throw new AccessError(403, 'Нет прав редактировать карточку');

  const assignees = patch.assigneeKeys ? await resolveKeys(patch.assigneeKeys) : null;
  await getDb().transaction(async (tx) => {
    await tx
      .update(tasks)
      .set({
        updatedAt: new Date(),
        ...(patch.text !== undefined ? { text: patch.text } : {}),
        ...(patch.stars !== undefined ? { stars: patch.stars } : {}),
        ...(patch.deadline !== undefined ? { deadline: patch.deadline } : {}),
      })
      .where(eq(tasks.id, taskId));
    if (assignees) {
      await tx.delete(taskAssignees).where(eq(taskAssignees.taskId, taskId));
      if (assignees.length) await tx.insert(taskAssignees).values(assignees.map((a) => ({ taskId, ...a })));
    }
  });
  return getTaskDetail(taskId, userId);
}

export async function blockTask(taskId: number, userId: number, reason: string): Promise<TaskDetail> {
  const ctx = await loadContext(taskId, userId);
  if (!canEdit(ctx.actor, ctx.ref)) throw new AccessError(403, 'Нет прав редактировать карточку');
  await getDb().update(tasks).set({ blocked: true, blockedReason: reason, updatedAt: new Date() }).where(eq(tasks.id, taskId));
  if (!ctx.task.blocked) await notifyAuthorStatus(ctx.task, ctx.chat, userId, 'blocked', reason);
  return getTaskDetail(taskId, userId);
}

export async function unblockTask(taskId: number, userId: number): Promise<TaskDetail> {
  const ctx = await loadContext(taskId, userId);
  if (!canEdit(ctx.actor, ctx.ref)) throw new AccessError(403, 'Нет прав редактировать карточку');
  if (ctx.task.blocked) {
    await getDb().transaction(async (tx) => {
      await tx.update(tasks).set({ blocked: false, blockedReason: null, updatedAt: new Date() }).where(eq(tasks.id, taskId));
      await tx.insert(comments).values({ taskId, authorId: null, kind: 'system', text: `Разблокировано. Причина была: ${ctx.task.blockedReason ?? ''}` });
    });
  }
  return getTaskDetail(taskId, userId);
}

export async function addComment(taskId: number, userId: number, text: string): Promise<TaskDetail> {
  const ctx = await loadContext(taskId, userId);
  if (!canComment(ctx.actor)) throw new AccessError(403, 'Нет прав комментировать');
  await getDb().insert(comments).values({ taskId, authorId: userId, kind: 'comment', text });
  const [me] = await getDb().select().from(users).where(eq(users.id, userId));
  await replyInGroup(ctx.chat.id, ctx.task.sourceMessageId, commentText(me ? displayName(me) : '?', ctx.task.number, text));
  return getTaskDetail(taskId, userId);
}

export async function deleteTask(taskId: number, userId: number): Promise<void> {
  const ctx = await loadContext(taskId, userId);
  if (!canDelete(ctx.actor, ctx.ref)) throw new AccessError(403, 'Удалить задачу может только автор');
  await getDb().delete(tasks).where(eq(tasks.id, taskId));
}

export async function showInChat(taskId: number, userId: number): Promise<{ mode: 'link'; url: string } | { mode: 'pinged' }> {
  const ctx = await loadContext(taskId, userId);
  const link = ctx.chat.type === 'supergroup' ? supergroupMessageLink(ctx.chat.id, ctx.task.sourceMessageId) : null;
  if (link) return { mode: 'link', url: link };
  if (ctx.chat.lastPinMessageId) await deleteMessage(ctx.chat.id, ctx.chat.lastPinMessageId);
  const sent = await replyInGroup(ctx.chat.id, ctx.task.sourceMessageId, pingText(ctx.task.number));
  await getDb().update(chats).set({ lastPinMessageId: sent?.message_id ?? null }).where(eq(chats.id, ctx.chat.id));
  return { mode: 'pinged' };
}

export async function loadAnalytics(chat: ChatRow, days: AnalyticsDays, now: Date): Promise<AnalyticsView> {
  const items = await fetchCards(chat.id, undefined, analyticsSince(days, now));
  const closed: ClosedTask[] = items.map(({ row, assignees }) => ({
    stars: row.stars,
    createdAt: row.createdAt.toISOString(),
    doneAt: row.doneAt!.toISOString(),
    deadline: row.deadline,
    assignees,
  }));
  return buildAnalytics(closed, days, now);
}
