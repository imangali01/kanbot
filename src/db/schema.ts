import { bigint, bigserial, boolean, date, doublePrecision, index, integer, jsonb, pgTable, primaryKey, smallint, text, timestamp, unique } from 'drizzle-orm/pg-core';

const tg = (name: string) => bigint(name, { mode: 'number' });
const ts = (name: string) => timestamp(name, { withTimezone: true });
const chatRef = { onDelete: 'cascade', onUpdate: 'cascade' } as const;

export const chats = pgTable('chats', {
  id: tg('id').primaryKey(),
  title: text('title').notNull().default(''),
  type: text('type').notNull(),
  status: text('status').notNull().default('pending'),
  creatorsMode: text('creators_mode').notNull().default('all'),
  nextTaskNumber: integer('next_task_number').notNull().default(1),
  lastPinMessageId: tg('last_pin_message_id'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const users = pgTable('users', {
  id: tg('id').primaryKey(),
  username: text('username'),
  firstName: text('first_name').notNull().default(''),
  lastName: text('last_name'),
  displayName: text('display_name'),
  startedBot: boolean('started_bot').notNull().default(false),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [index('users_username_idx').on(t.username)]);

export const chatMembers = pgTable('chat_members', {
  chatId: tg('chat_id').notNull().references(() => chats.id, chatRef),
  userId: tg('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  isMember: boolean('is_member').notNull().default(true),
  checkedAt: ts('checked_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.chatId, t.userId] })]);

export const chatCreators = pgTable('chat_creators', {
  chatId: tg('chat_id').notNull().references(() => chats.id, chatRef),
  userId: tg('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.chatId, t.userId] })]);

export const tasks = pgTable('tasks', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  chatId: tg('chat_id').notNull().references(() => chats.id, chatRef),
  number: integer('number').notNull(),
  text: text('text').notNull(),
  status: text('status').notNull().default('todo'),
  position: doublePrecision('position').notNull().default(0),
  stars: smallint('stars').notNull().default(1),
  deadline: date('deadline', { mode: 'string' }).notNull(),
  blocked: boolean('blocked').notNull().default(false),
  blockedReason: text('blocked_reason'),
  authorId: tg('author_id').notNull().references(() => users.id),
  sourceMessageId: tg('source_message_id').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
  doneAt: ts('done_at'),
}, (t) => [unique('tasks_chat_number_uq').on(t.chatId, t.number), index('tasks_chat_idx').on(t.chatId)]);

export const taskAssignees = pgTable('task_assignees', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  taskId: bigint('task_id', { mode: 'number' }).notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  userId: tg('user_id').references(() => users.id, { onDelete: 'cascade' }),
  username: text('username'),
}, (t) => [unique('ta_task_user_uq').on(t.taskId, t.userId), unique('ta_task_username_uq').on(t.taskId, t.username), index('ta_username_idx').on(t.username)]);

export const comments = pgTable('comments', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  taskId: bigint('task_id', { mode: 'number' }).notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  authorId: tg('author_id').references(() => users.id),
  kind: text('kind').notNull().default('comment'),
  text: text('text').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('comments_task_idx').on(t.taskId)]);

export const taskEvents = pgTable('task_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  taskId: bigint('task_id', { mode: 'number' }).notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  actorId: tg('actor_id').references(() => users.id, { onDelete: 'set null' }),
  type: text('type').notNull(),
  payload: jsonb('payload').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('task_events_task_idx').on(t.taskId)]);

export const adminLoginCodes = pgTable('admin_login_codes', {
  username: text('username').primaryKey(),
  codeHash: text('code_hash').notNull(),
  expiresAt: ts('expires_at').notNull(),
  attempts: integer('attempts').notNull().default(0),
  lockedUntil: ts('locked_until'),
});

export const adminSessions = pgTable('admin_sessions', {
  tokenHash: text('token_hash').primaryKey(),
  userId: tg('user_id').notNull(),
  expiresAt: ts('expires_at').notNull(),
});
