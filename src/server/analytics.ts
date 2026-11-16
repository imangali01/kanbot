import { and, asc, eq, gte, inArray, ne, or } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { taskAssignees, taskEvents, tasks, users } from '@/db/schema';
import { analyticsSince, buildAnalytics, type AnalyticsTask } from '@/domain/analytics';
import type { FlowEvent } from '@/domain/flow';
import type { AnalyticsDays, AnalyticsView, AssigneeView, Status } from '@/domain/types';
import { displayName } from '@/telegram/messages';
import type { ChatRow } from './chats';

/** Предохранители от разросшейся доски: аналитика должна отвечать за один запрос, а не тянуть всё подряд. */
const MAX_TASKS = 20_000;
const MAX_EVENTS = 50_000;
const FLOW_EVENTS = ['status', 'blocked', 'unblocked'];

const unknownUser = { firstName: '?', lastName: null, username: null };

/**
 * Задачи чата и исполнители — целиком (CFD и фильтр нужны и для «старого» Done), а журнал — только у задач,
 * которые открыты или закрыты не раньше начала прошлого периода: остальные весь период лежат в Done.
 */
export async function loadAnalytics(chat: ChatRow, days: AnalyticsDays, now: Date, assignee: string | null): Promise<AnalyticsView> {
  const db = getDb();
  const since = analyticsSince(days, now);
  const relevant = and(eq(tasks.chatId, chat.id), or(ne(tasks.status, 'done'), gte(tasks.doneAt, since)));

  const [rows, eventRows, assigneeRows] = await Promise.all([
    db
      .select({
        id: tasks.id, number: tasks.number, text: tasks.text, status: tasks.status, stars: tasks.stars, deadline: tasks.deadline,
        blocked: tasks.blocked, createdAt: tasks.createdAt, doneAt: tasks.doneAt,
      })
      .from(tasks)
      .where(eq(tasks.chatId, chat.id))
      .limit(MAX_TASKS),
    db
      .select({ taskId: taskEvents.taskId, type: taskEvents.type, payload: taskEvents.payload, createdAt: taskEvents.createdAt })
      .from(taskEvents)
      .innerJoin(tasks, eq(tasks.id, taskEvents.taskId))
      .where(and(relevant, inArray(taskEvents.type, FLOW_EVENTS)))
      .orderBy(asc(taskEvents.createdAt), asc(taskEvents.id))
      .limit(MAX_EVENTS),
    db
      .select({ taskId: taskAssignees.taskId, userId: taskAssignees.userId, username: taskAssignees.username, user: users })
      .from(taskAssignees)
      .innerJoin(tasks, eq(tasks.id, taskAssignees.taskId))
      .leftJoin(users, eq(users.id, taskAssignees.userId))
      .where(eq(tasks.chatId, chat.id)),
  ]);

  const eventsByTask = new Map<number, FlowEvent[]>();
  for (const e of eventRows) {
    const at = e.createdAt.toISOString();
    const payload = e.payload as { from?: Status; to?: Status };
    const event: FlowEvent | null =
      e.type === 'status' && payload.from && payload.to ? { type: 'status', at, from: payload.from, to: payload.to }
        : e.type === 'blocked' ? { type: 'blocked', at }
          : e.type === 'unblocked' ? { type: 'unblocked', at }
            : null;
    if (!event) continue;
    const list = eventsByTask.get(e.taskId);
    if (list) list.push(event);
    else eventsByTask.set(e.taskId, [event]);
  }

  const assigneesByTask = new Map<number, AssigneeView[]>();
  for (const a of assigneeRows) {
    const view: AssigneeView =
      a.userId !== null
        ? { key: `u:${a.userId}`, userId: a.userId, username: a.user?.username ?? null, name: displayName(a.user ?? unknownUser) }
        : { key: `n:${a.username}`, userId: null, username: a.username, name: `@${a.username}` };
    const list = assigneesByTask.get(a.taskId);
    if (list) list.push(view);
    else assigneesByTask.set(a.taskId, [view]);
  }

  const input: AnalyticsTask[] = rows.map((r) => ({
    id: r.id,
    number: r.number,
    text: r.text,
    status: r.status as Status,
    stars: r.stars,
    deadline: r.deadline,
    blocked: r.blocked,
    createdAt: r.createdAt.toISOString(),
    doneAt: r.doneAt?.toISOString() ?? null,
    assignees: assigneesByTask.get(r.id) ?? [],
    events: eventsByTask.get(r.id) ?? [],
  }));
  return buildAnalytics(input, days, now, assignee);
}
