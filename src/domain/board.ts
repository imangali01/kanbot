import { normalizeText, stemRu, words } from './stem';
import { ticketId } from './ticketId';
import type { CardView, SortMode } from './types';

export const HIDE_DONE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
export const NO_ASSIGNEE = 'none';

export function isHiddenDone(card: Pick<CardView, 'status' | 'doneAt'>, now: Date): boolean {
  return card.status === 'done' && card.doneAt !== null && now.getTime() - Date.parse(card.doneAt) > HIDE_DONE_AFTER_MS;
}

function matchesAssignee(card: CardView, key: string | null): boolean {
  if (key === null) return true;
  if (key === NO_ASSIGNEE) return card.assignees.length === 0;
  return card.assignees.some((a) => a.key === key);
}

/**
 * Поиск по слову (текст, причина блокировки, автор, исполнители) или по ID: «SD-0004», «sd4», «#4», «4».
 * Слова сравниваются по основе (стемминг), поэтому «область» находит «области», «областей» и т. п.
 */
export function matchesQuery(card: CardView, raw: string): boolean {
  const q = normalizeText(raw);
  if (!q) return true;
  const byId = /^(?:sd[\s-]*)?#?(\d{1,6})$/.exec(q);
  if (byId && Number(byId[1]) === card.number) return true;
  if (q.startsWith('sd') && ticketId(card.number).toLowerCase().includes(q)) return true;

  const haystack = normalizeText([card.text, card.blockedReason ?? '', card.authorName, ...card.assignees.map((a) => a.name)].join(' '));
  if (haystack.includes(q)) return true;
  const stems = words(haystack).map(stemRu);
  return words(q).every((w) => {
    const stem = stemRu(w);
    return stems.some((s) => s.startsWith(stem));
  });
}

export function visibleCards(
  cards: CardView[],
  opts: { now: Date; showAll: boolean; assigneeKey: string | null; query?: string },
): CardView[] {
  const searching = !!opts.query?.trim();
  return cards.filter(
    (c) => (opts.showAll || searching || !isHiddenDone(c, opts.now)) && matchesAssignee(c, opts.assigneeKey) && (!searching || matchesQuery(c, opts.query!)),
  );
}

const byCreatedDesc = (a: CardView, b: CardView) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id;

export function sortCards(cards: CardView[], mode: SortMode): CardView[] {
  const copy = [...cards];
  switch (mode) {
    case 'manual':
      return copy.sort((a, b) => a.position - b.position || a.id - b.id);
    case 'created':
      return copy.sort(byCreatedDesc);
    case 'stars':
      return copy.sort((a, b) => b.stars - a.stars || byCreatedDesc(a, b));
    case 'deadline':
      return copy.sort((a, b) => a.deadline.localeCompare(b.deadline) || byCreatedDesc(a, b));
  }
}
