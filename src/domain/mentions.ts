export interface MentionMember { userId: number | null; username: string | null; name: string }

export type MentionSegment =
  | { type: 'text'; text: string }
  | { type: 'mention'; text: string; member: MentionMember };

const WORD = '[\\p{L}\\p{N}_]';

// как участник записывается в тексте после @: username или имя с _ вместо пробелов
export function mentionHandle(m: Pick<MentionMember, 'username' | 'name'>): string {
  return m.username ?? m.name.trim().replace(/\s+/g, '_');
}

const norm = (s: string) => s.toLowerCase();

// разбивает текст на обычные куски и упоминания участников доски; незнакомые @слова остаются текстом
export function splitMentions(text: string, members: MentionMember[]): MentionSegment[] {
  const byHandle = new Map<string, MentionMember>();
  for (const m of members) byHandle.set(norm(mentionHandle(m)), m);
  const re = new RegExp(`(^|[\\s(])@(${WORD}+)`, 'gu');
  const out: MentionSegment[] = [];
  let last = 0;
  const push = (t: string) => {
    if (!t) return;
    const prev = out[out.length - 1];
    if (prev?.type === 'text') prev.text += t;
    else out.push({ type: 'text', text: t });
  };
  for (const match of text.matchAll(re)) {
    const member = byHandle.get(norm(match[2]));
    if (!member) continue;
    const start = match.index + match[1].length;
    push(text.slice(last, start));
    out.push({ type: 'mention', text: `@${match[2]}`, member });
    last = start + 1 + match[2].length;
  }
  push(text.slice(last));
  return out;
}

// незавершённое упоминание прямо перед курсором: «@ан» → { start, query: 'ан' }
export function activeMention(value: string, caret: number): { start: number; query: string } | null {
  const m = new RegExp(`(^|[\\s(])@(${WORD}*)$`, 'u').exec(value.slice(0, caret));
  if (!m) return null;
  return { start: caret - m[2].length - 1, query: m[2] };
}

export function filterMembers<T extends MentionMember>(members: T[], query: string): T[] {
  const q = norm(query);
  return members.filter((m) => !q || norm(m.name).includes(q) || norm(m.username ?? '').includes(q));
}

// подставляет выбранного участника вместо «@запрос» и возвращает новое значение и позицию курсора
export function applyMention(value: string, caret: number, start: number, member: MentionMember): { value: string; caret: number } {
  const insert = `@${mentionHandle(member)} `;
  return { value: value.slice(0, start) + insert + value.slice(caret), caret: start + insert.length };
}
