import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { chatCreators, chatMembers, chats, users } from '@/db/schema';
import { computeIsCreator, type Actor } from '@/domain/permissions';
import { env } from '@/env';
import { tg } from '@/telegram/notifier';
import type { UserRow } from './users';

export type ChatRow = typeof chats.$inferSelect;

const MEMBERSHIP_TTL_MS = 10 * 60 * 1000;

export async function upsertPendingChat(chat: { id: number; title?: string; type: string }): Promise<void> {
  const db = getDb();
  const [existing] = await db.select().from(chats).where(eq(chats.id, chat.id));
  if (!existing) {
    await db.insert(chats).values({ id: chat.id, title: chat.title ?? '', type: chat.type, status: 'pending' });
    return;
  }
  await db
    .update(chats)
    .set({ title: chat.title ?? existing.title, type: chat.type, status: existing.status === 'enabled' ? 'enabled' : 'pending' })
    .where(eq(chats.id, chat.id));
}

export async function setChatStatus(id: number, status: 'pending' | 'enabled' | 'disabled'): Promise<void> {
  await getDb().update(chats).set({ status }).where(eq(chats.id, id));
}

export async function migrateChat(oldId: number, newId: number): Promise<void> {
  await getDb().transaction(async (tx) => {
    await tx.delete(chats).where(eq(chats.id, newId));
    await tx.update(chats).set({ id: newId, type: 'supergroup', lastPinMessageId: null }).where(eq(chats.id, oldId));
  });
}

export async function getChat(id: number): Promise<ChatRow | null> {
  const [row] = await getDb().select().from(chats).where(eq(chats.id, id));
  return row ?? null;
}

export async function touchMember(chatId: number, userId: number, isMember: boolean): Promise<void> {
  const now = new Date();
  await getDb()
    .insert(chatMembers)
    .values({ chatId, userId, isMember, checkedAt: now })
    .onConflictDoUpdate({ target: [chatMembers.chatId, chatMembers.userId], set: { isMember, checkedAt: now } });
}

export async function checkMembership(chatId: number, userId: number): Promise<boolean> {
  const [row] = await getDb()
    .select()
    .from(chatMembers)
    .where(and(eq(chatMembers.chatId, chatId), eq(chatMembers.userId, userId)));
  if (row && Date.now() - row.checkedAt.getTime() < MEMBERSHIP_TTL_MS) return row.isMember;

  let isMember = false;
  try {
    const m = await tg().getChatMember(chatId, userId);
    isMember = m.status === 'creator' || m.status === 'administrator' || m.status === 'member' || (m.status === 'restricted' && m.is_member);
  } catch {
    isMember = false;
  }
  await touchMember(chatId, userId, isMember);
  return isMember;
}

export async function listChatsForUser(userId: number): Promise<ChatRow[]> {
  const enabled = await getDb().select().from(chats).where(eq(chats.status, 'enabled')).orderBy(chats.title);
  const flags = await Promise.all(enabled.map((c) => checkMembership(c.id, userId)));
  return enabled.filter((_, i) => flags[i]);
}

export async function listAllChats(): Promise<ChatRow[]> {
  return getDb().select().from(chats).orderBy(desc(chats.createdAt));
}

export async function listMembers(chatId: number): Promise<UserRow[]> {
  const rows = await getDb()
    .select({ user: users })
    .from(chatMembers)
    .innerJoin(users, eq(users.id, chatMembers.userId))
    .where(and(eq(chatMembers.chatId, chatId), eq(chatMembers.isMember, true)))
    .orderBy(users.firstName);
  return rows.map((r) => r.user);
}

export async function getCreatorIds(chatId: number): Promise<number[]> {
  const rows = await getDb().select({ userId: chatCreators.userId }).from(chatCreators).where(eq(chatCreators.chatId, chatId));
  return rows.map((r) => r.userId);
}

export async function setCreatorsMode(chatId: number, mode: 'all' | 'list'): Promise<void> {
  await getDb().update(chats).set({ creatorsMode: mode }).where(eq(chats.id, chatId));
}

export async function setCreators(chatId: number, userIds: number[]): Promise<void> {
  await getDb().transaction(async (tx) => {
    await tx.delete(chatCreators).where(eq(chatCreators.chatId, chatId));
    if (userIds.length) await tx.insert(chatCreators).values(userIds.map((userId) => ({ chatId, userId })));
  });
}

export async function getActor(chat: ChatRow, userId: number): Promise<Actor> {
  const isMember = await checkMembership(chat.id, userId);
  const allowlist = chat.creatorsMode === 'list' ? await getCreatorIds(chat.id) : [];
  return {
    userId,
    isSuperadmin: env.superadminIds.includes(userId),
    isMember,
    isCreator: computeIsCreator(chat.creatorsMode, allowlist, userId, isMember),
  };
}
