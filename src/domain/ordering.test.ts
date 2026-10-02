import { describe, expect, it } from 'vitest';
import { GAP, placeCard, positionBetween, topPosition } from './ordering';

describe('positionBetween', () => {
  it('empty column', () => expect(positionBetween(null, null)).toBe(0));
  it('top', () => expect(positionBetween(null, 100)).toBe(100 - GAP));
  it('bottom', () => expect(positionBetween(200, null)).toBe(200 + GAP));
  it('middle', () => expect(positionBetween(100, 200)).toBe(150));
});

describe('topPosition', () => {
  it('empty → 0', () => expect(topPosition([])).toBe(0));
  it('above minimum', () => expect(topPosition([5, -3, 10])).toBe(-3 - GAP));
});

describe('placeCard', () => {
  const col = [{ id: 1, position: 100 }, { id: 2, position: 200 }];
  it('into empty column', () => expect(placeCard([], 9, null)).toEqual([{ id: 9, position: 0 }]));
  it('to top when aboveId is null', () => expect(placeCard(col, 9, null)).toEqual([{ id: 9, position: 100 - GAP }]));
  it('after card 1', () => expect(placeCard(col, 9, 1)).toEqual([{ id: 9, position: 150 }]));
  it('after last card', () => expect(placeCard(col, 9, 2)).toEqual([{ id: 9, position: 200 + GAP }]));
  it('unknown aboveId → top', () => expect(placeCard(col, 9, 777)).toEqual([{ id: 9, position: 100 - GAP }]));
  it('rebalances the column when the gap is too small', () => {
    const tight = [{ id: 1, position: 0 }, { id: 2, position: 1e-7 }];
    expect(placeCard(tight, 9, 1)).toEqual([
      { id: 1, position: 0 },
      { id: 9, position: GAP },
      { id: 2, position: 2 * GAP },
    ]);
  });
});
