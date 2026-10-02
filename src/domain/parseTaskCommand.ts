export interface TgUserLike { id: number; username?: string; first_name: string; last_name?: string }
export interface MsgEntity { type: string; offset: number; length: number; user?: TgUserLike }
export interface IncomingMessage {
  message_id: number;
  text?: string;
  caption?: string;
  entities?: MsgEntity[];
  reply_to_message?: IncomingMessage;
}
export type AssigneeRef = { kind: 'user'; user: TgUserLike } | { kind: 'username'; username: string };
export type ParseResult =
  | { ok: true; text: string; assignees: AssigneeRef[]; sourceMessageId: number }
  | { ok: false; reason: 'not_command' | 'empty_text' };

function removeRanges(text: string, ranges: Array<[number, number]>): string {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  let out = '';
  let pos = 0;
  for (const [start, end] of sorted) {
    if (start < pos) continue;
    out += text.slice(pos, start) + ' ';
    pos = end;
  }
  return out + text.slice(pos);
}

function normalize(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function parseTaskCommand(msg: IncomingMessage, botUsername: string): ParseResult {
  const text = msg.text ?? '';
  const entities = msg.entities ?? [];
  const command = entities.find((e) => e.type === 'bot_command' && e.offset === 0);
  if (!command) return { ok: false, reason: 'not_command' };

  const [name, target] = text.slice(0, command.length).toLowerCase().split('@');
  const bot = botUsername.toLowerCase();
  if (name !== '/task' || (target !== undefined && target !== bot)) return { ok: false, reason: 'not_command' };

  const assignees: AssigneeRef[] = [];
  const seen = new Set<string>();
  const cut: Array<[number, number]> = [[0, command.length]];
  const bareNames: string[] = [];

  for (const e of entities) {
    if (e.type === 'mention') {
      cut.push([e.offset, e.offset + e.length]);
      const username = text.slice(e.offset + 1, e.offset + e.length).toLowerCase();
      if (username === bot || seen.has(`n:${username}`)) continue;
      seen.add(`n:${username}`);
      assignees.push({ kind: 'username', username });
    } else if (e.type === 'text_mention' && e.user) {
      // клиент может оставить набранную «@» перед именем человека без username
      const start = text[e.offset - 1] === '@' ? e.offset - 1 : e.offset;
      cut.push([start, e.offset + e.length]);
      bareNames.push(text.slice(e.offset, e.offset + e.length));
      if (seen.has(`u:${e.user.id}`)) continue;
      seen.add(`u:${e.user.id}`);
      assignees.push({ kind: 'user', user: e.user });
    }
  }

  const rest = normalize(removeRanges(text, cut));
  const reply = msg.reply_to_message;
  const base = reply ? normalize(reply.text ?? reply.caption ?? '') : '';
  let full = [base, rest].filter(Boolean).join('\n');
  // у человека без username имя и есть упоминание: задача без другого текста называется по нему
  if (!full && bareNames.length) full = bareNames.join(', ');
  if (!full) return { ok: false, reason: 'empty_text' };

  return { ok: true, text: full, assignees, sourceMessageId: reply ? reply.message_id : msg.message_id };
}
