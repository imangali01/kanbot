import type { ChatMemberUpdated, Message, Update } from 'grammy/types';
import { parseTaskCommand, type IncomingMessage } from '@/domain/parseTaskCommand';
import { canCreate } from '@/domain/permissions';
import { env } from '@/env';
import { NO_RIGHTS_TEXT, START_TEXT, USAGE_TEXT } from '@/telegram/messages';
import { replyInGroup, sendDm } from '@/telegram/notifier';
import { getActor, getChat, migrateChat, setChatStatus, touchMember, upsertPendingChat } from './chats';
import { notifyTaskCreated } from './notifications';
import { createTask } from './tasks';
import { setStartedBot, upsertUser } from './users';

const isGroup = (type: string) => type === 'group' || type === 'supergroup';

async function onMyChatMember(u: ChatMemberUpdated): Promise<void> {
  if (!isGroup(u.chat.type)) return;
  const status = u.new_chat_member.status;
  if (status === 'member' || status === 'administrator') {
    await upsertPendingChat({ id: u.chat.id, title: 'title' in u.chat ? u.chat.title : undefined, type: u.chat.type });
  } else if (status === 'left' || status === 'kicked') {
    await setChatStatus(u.chat.id, 'disabled');
  }
}

async function onPrivate(msg: Message): Promise<void> {
  if (!msg.from || !msg.text?.startsWith('/start')) return;
  await upsertUser(msg.from);
  await setStartedBot(msg.from.id, true);
  await sendDm(msg.from.id, START_TEXT);
}

async function onGroupMessage(msg: Message): Promise<void> {
  if (msg.migrate_to_chat_id) {
    await migrateChat(msg.chat.id, msg.migrate_to_chat_id);
    return;
  }
  const chat = await getChat(msg.chat.id);
  if (!chat) {
    await upsertPendingChat({ id: msg.chat.id, title: 'title' in msg.chat ? msg.chat.title : undefined, type: msg.chat.type });
    return;
  }
  if (chat.status !== 'enabled') return;

  if (msg.from && !msg.from.is_bot) {
    await upsertUser(msg.from);
    await touchMember(chat.id, msg.from.id, true);
  }
  for (const u of msg.new_chat_members ?? []) {
    if (u.is_bot) continue;
    await upsertUser(u);
    await touchMember(chat.id, u.id, true);
  }
  if (msg.left_chat_member && !msg.left_chat_member.is_bot) {
    await upsertUser(msg.left_chat_member);
    await touchMember(chat.id, msg.left_chat_member.id, false);
  }
  if (!msg.from || msg.from.is_bot) return;

  const parsed = parseTaskCommand(msg as unknown as IncomingMessage, env.botUsername);
  if (!parsed.ok) {
    if (parsed.reason === 'empty_text') await replyInGroup(chat.id, msg.message_id, USAGE_TEXT);
    return;
  }
  const actor = await getActor(chat, msg.from.id);
  if (!canCreate(actor)) {
    await replyInGroup(chat.id, msg.message_id, NO_RIGHTS_TEXT);
    return;
  }
  const created = await createTask({
    chat,
    authorId: msg.from.id,
    text: parsed.text,
    assignees: parsed.assignees,
    sourceMessageId: parsed.sourceMessageId,
    now: new Date(),
  });
  await notifyTaskCreated({
    chat,
    taskNumber: created.number,
    text: parsed.text,
    deadline: created.deadline,
    sourceMessageId: parsed.sourceMessageId,
    authorId: msg.from.id,
    assignees: created.assignees,
  });
}

export async function handleUpdate(update: Update): Promise<void> {
  if (update.my_chat_member) return onMyChatMember(update.my_chat_member);
  const msg = update.message;
  if (!msg) return;
  if (msg.chat.type === 'private') return onPrivate(msg);
  if (isGroup(msg.chat.type)) return onGroupMessage(msg);
}
