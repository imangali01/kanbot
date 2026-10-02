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

export function visibleCards(
  cards: CardView[],
  opts: { now: Date; showAll: boolean; assigneeKey: string | null },
): CardView[] {
  return cards.filter((c) => (opts.showAll || !isHiddenDone(c, opts.now)) && matchesAssignee(c, opts.assigneeKey));
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
