import { describe, expect, it } from 'vitest';
import { NO_ASSIGNEE, isHiddenDone, sortCards, visibleCards } from './board';
import type { CardView } from './types';

const card = (p: Partial<CardView>): CardView => ({
  id: 1, number: 1, text: 't', status: 'todo', position: 0, stars: 1, deadline: '2026-10-03', blocked: false,
  blockedReason: null, createdAt: '2026-10-01T00:00:00.000Z', doneAt: null, authorId: 1, authorName: 'A',
  assignees: [], canEdit: true, canEditText: true, canDelete: true, ...p,
});
const now = new Date('2026-11-15T00:00:00Z');

describe('isHiddenDone', () => {
  it('hides done older than 30 days', () => {
    expect(isHiddenDone(card({ status: 'done', doneAt: '2026-10-15T00:00:00.000Z' }), now)).toBe(true);
    expect(isHiddenDone(card({ status: 'done', doneAt: '2026-10-20T00:00:00.000Z' }), now)).toBe(false);
    expect(isHiddenDone(card({ status: 'todo', doneAt: null }), now)).toBe(false);
  });
});

describe('visibleCards', () => {
  const old = card({ id: 1, status: 'done', doneAt: '2026-09-01T00:00:00.000Z' });
  const mine = card({ id: 2, assignees: [{ key: 'u:5', userId: 5, username: 'x', name: 'X' }] });
  const nobody = card({ id: 3 });
  it('hides old done unless showAll', () => {
    expect(visibleCards([old, mine], { now, showAll: false, assigneeKey: null }).map((c) => c.id)).toEqual([2]);
    expect(visibleCards([old, mine], { now, showAll: true, assigneeKey: null }).map((c) => c.id)).toEqual([1, 2]);
  });
  it('filters by assignee and by no-assignee', () => {
    expect(visibleCards([mine, nobody], { now, showAll: true, assigneeKey: 'u:5' }).map((c) => c.id)).toEqual([2]);
    expect(visibleCards([mine, nobody], { now, showAll: true, assigneeKey: NO_ASSIGNEE }).map((c) => c.id)).toEqual([3]);
  });
});

describe('sortCards', () => {
  const a = card({ id: 1, position: 30, stars: 2, deadline: '2026-10-05', createdAt: '2026-10-01T00:00:00.000Z' });
  const b = card({ id: 2, position: 10, stars: 5, deadline: '2026-10-09', createdAt: '2026-10-03T00:00:00.000Z' });
  const c = card({ id: 3, position: 20, stars: 2, deadline: '2026-10-01', createdAt: '2026-10-02T00:00:00.000Z' });
  const ids = (xs: CardView[]) => xs.map((x) => x.id);
  it('manual by position', () => expect(ids(sortCards([a, b, c], 'manual'))).toEqual([2, 3, 1]));
  it('created newest first', () => expect(ids(sortCards([a, b, c], 'created'))).toEqual([2, 3, 1]));
  it('stars desc, then newest', () => expect(ids(sortCards([a, b, c], 'stars'))).toEqual([2, 3, 1]));
  it('deadline asc', () => expect(ids(sortCards([a, b, c], 'deadline'))).toEqual([3, 1, 2]));
  it('does not mutate input', () => {
    const input = [a, b, c];
    sortCards(input, 'deadline');
    expect(ids(input)).toEqual([1, 2, 3]);
  });
});
