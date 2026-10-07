import { asc, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { taskEvents, users } from '@/db/schema';
import type { EventPayloads, EventType, TaskEvent } from '@/domain/events';
import { displayName } from '@/telegram/messages';

type Tx = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];

/** Пишется в той же транзакции, что и само изменение, чтобы история не расходилась с карточкой. */
export async function recordEvent<T extends EventType>(
  tx: Tx,
  e: { taskId: number; actorId: number | null; type: T; payload: EventPayloads[T] },
): Promise<void> {
  await tx.insert(taskEvents).values({ taskId: e.taskId, actorId: e.actorId, type: e.type, payload: e.payload });
}

export async function loadEvents(taskId: number): Promise<TaskEvent[]> {
  const rows = await getDb()
    .select({ e: taskEvents, actor: users })
    .from(taskEvents)
    .leftJoin(users, eq(users.id, taskEvents.actorId))
    .where(eq(taskEvents.taskId, taskId))
    .orderBy(asc(taskEvents.createdAt), asc(taskEvents.id));
  return rows.map(({ e, actor }) => ({
    id: e.id,
    type: e.type,
    payload: e.payload,
    actorName: actor ? displayName(actor) : null,
    createdAt: e.createdAt.toISOString(),
  })) as TaskEvent[];
}
