import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { taskAssignees, users } from '@/db/schema';

export interface TgUser { id: number; username?: string; first_name: string; last_name?: string }
export type UserRow = typeof users.$inferSelect;

export async function upsertUser(u: TgUser): Promise<void> {
  const db = getDb();
  const username = u.username?.toLowerCase() ?? null;
  const values = { username, firstName: u.first_name ?? '', lastName: u.last_name ?? null, updatedAt: new Date() };
  if (username) {
    await db.update(users).set({ username: null }).where(and(eq(users.username, username), ne(users.id, u.id)));
  }
  await db.insert(users).values({ id: u.id, ...values }).onConflictDoUpdate({ target: users.id, set: values });
  if (username) await resolvePendingAssignees(u.id, username);
}

async function resolvePendingAssignees(userId: number, username: string): Promise<void> {
  const db = getDb();
  await db.execute(sql`
    delete from task_assignees a
    where a.username = ${username} and a.user_id is null
      and exists (select 1 from task_assignees b where b.task_id = a.task_id and b.user_id = ${userId})`);
  await db
    .update(taskAssignees)
    .set({ userId })
    .where(and(eq(taskAssignees.username, username), isNull(taskAssignees.userId)));
}

export async function setStartedBot(userId: number, started: boolean): Promise<void> {
  await getDb().update(users).set({ startedBot: started }).where(eq(users.id, userId));
}

export async function findUserByUsername(username: string): Promise<UserRow | null> {
  const [row] = await getDb().select().from(users).where(eq(users.username, username.toLowerCase()));
  return row ?? null;
}

export async function getUsers(ids: number[]): Promise<UserRow[]> {
  if (ids.length === 0) return [];
  return getDb().select().from(users).where(inArray(users.id, ids));
}
