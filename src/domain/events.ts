import { STATUS_TITLES, type CommentView, type HistoryItem, type Status } from './types';

export interface EventPayloads {
  created: { author: string; assignees: string[] };
  status: { from: Status; to: Status };
  author: { from: string; to: string };
  assignees: { from: string[]; to: string[] };
  stars: { from: number; to: number };
  deadline: { from: string; to: string };
  text: { from: string; to: string };
  blocked: { reason: string };
  unblocked: { reason: string | null };
}
export type EventType = keyof EventPayloads;
export type TaskEvent = {
  [K in EventType]: { id: number; type: K; payload: EventPayloads[K]; actorName: string | null; createdAt: string };
}[EventType];

const list = (names: string[]) => (names.length ? names.join(', ') : 'никого');
const date = (iso: string) => iso.split('-').reverse().join('.');

/** Текст действия без имени того, кто его совершил. */
export function formatEvent(e: TaskEvent): string {
  switch (e.type) {
    case 'created':
      return e.payload.assignees.length ? `создал задачу, исполнители: ${e.payload.assignees.join(', ')}` : 'создал задачу';
    case 'status':
      return `перенёс: ${STATUS_TITLES[e.payload.from]} → ${STATUS_TITLES[e.payload.to]}`;
    case 'author':
      return `сменил постановщика: ${e.payload.from} → ${e.payload.to}`;
    case 'assignees':
      return `сменил исполнителей: ${list(e.payload.from)} → ${list(e.payload.to)}`;
    case 'stars':
      return `изменил сложность: ${e.payload.from} → ${e.payload.to}`;
    case 'deadline':
      return `изменил срок: ${date(e.payload.from)} → ${date(e.payload.to)}`;
    case 'text':
      return 'изменил текст задачи';
    case 'blocked':
      return `заблокировал: ${e.payload.reason}`;
    case 'unblocked':
      return e.payload.reason ? `снял блокировку (была: ${e.payload.reason})` : 'снял блокировку';
  }
}

export function mergeHistory(events: TaskEvent[], comments: CommentView[]): HistoryItem[] {
  const items: HistoryItem[] = [
    ...events.map((e): HistoryItem => ({ id: `e:${e.id}`, kind: 'event', actorName: e.actorName, text: formatEvent(e), createdAt: e.createdAt })),
    ...comments.map((c): HistoryItem =>
      c.kind === 'system'
        ? { id: `c:${c.id}`, kind: 'event', actorName: null, text: c.text, createdAt: c.createdAt }
        : { id: `c:${c.id}`, kind: 'comment', actorName: c.authorName, text: c.text, createdAt: c.createdAt }),
  ];
  return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id, 'en', { numeric: true }));
}
