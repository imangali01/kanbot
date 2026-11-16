import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { chatMedia, taskAttachments, tasks } from '@/db/schema';
import { messageAttachments, type AttachmentInput, type MessageWithMedia } from '@/domain/attachments';

export type Tx = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];

const KEEP_DAYS = 7;

/** Блокировка на альбом: создание тикета и приход файлов альбома не должны разминуться и потерять файл. */
export async function lockMediaGroups(tx: Tx, chatId: number, groupIds: string[]): Promise<void> {
  for (const id of [...groupIds].sort()) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${chatId}:${id}`}))`);
  }
}

/** Вложения альбомов, которые бот уже получил. */
export async function loadGroupAttachments(tx: Tx, chatId: number, groupIds: string[]): Promise<AttachmentInput[]> {
  if (groupIds.length === 0) return [];
  const rows = await tx
    .select()
    .from(chatMedia)
    .where(and(eq(chatMedia.chatId, chatId), inArray(chatMedia.mediaGroupId, groupIds)))
    .orderBy(chatMedia.messageId, chatMedia.id);
  return rows.map((r) => ({ kind: r.kind as AttachmentInput['kind'], fileId: r.fileId, uniqueId: r.fileUniqueId, name: r.name, mime: r.mime, size: r.size }));
}

/**
 * Файл альбома: запоминаем и, если по этому альбому уже создан тикет, дописываем файл в него.
 * Нужно, потому что файлы альбома приходят отдельными сообщениями, а /task — только в одном из них.
 */
export async function recordGroupMedia(chatId: number, msg: MessageWithMedia & { message_id: number }): Promise<void> {
  const groupId = msg.media_group_id;
  const files = messageAttachments(msg);
  if (!groupId || files.length === 0) return;

  await getDb().transaction(async (tx) => {
    await lockMediaGroups(tx, chatId, [groupId]);
    await tx
      .insert(chatMedia)
      .values(files.map((f) => ({ chatId, messageId: msg.message_id, mediaGroupId: groupId, kind: f.kind, fileId: f.fileId, fileUniqueId: f.uniqueId, name: f.name, mime: f.mime, size: f.size })))
      .onConflictDoNothing();
    const linked = await tx.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.chatId, chatId), eq(tasks.mediaGroupId, groupId)));
    for (const t of linked) {
      const have = await tx.select({ u: taskAttachments.fileUniqueId }).from(taskAttachments).where(eq(taskAttachments.taskId, t.id));
      const haveSet = new Set(have.map((h) => h.u));
      const fresh = files.filter((f) => !haveSet.has(f.uniqueId));
      if (fresh.length) {
        await tx.insert(taskAttachments).values(fresh.map((f) => ({ taskId: t.id, kind: f.kind, fileId: f.fileId, fileUniqueId: f.uniqueId, name: f.name, mime: f.mime, size: f.size })));
      }
    }
  });

  // буфер нужен только пока альбом разбирают: старое подчищаем изредка
  if (Math.random() < 0.05) {
    await getDb().delete(chatMedia).where(lt(chatMedia.createdAt, new Date(Date.now() - KEEP_DAYS * 24 * 3600 * 1000)));
  }
}
