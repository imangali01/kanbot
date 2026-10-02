export const GAP = 1024;
export const MIN_GAP = 1e-6;

export function positionBetween(before: number | null, after: number | null): number {
  if (before === null && after === null) return 0;
  if (before === null) return (after as number) - GAP;
  if (after === null) return before + GAP;
  return (before + after) / 2;
}

export function topPosition(positions: number[]): number {
  return positions.length ? Math.min(...positions) - GAP : 0;
}

export function placeCard(
  column: { id: number; position: number }[],
  movedId: number,
  aboveId: number | null,
): { id: number; position: number }[] {
  const aboveIndex = aboveId === null ? -1 : column.findIndex((c) => c.id === aboveId);
  const index = aboveIndex + 1;
  const prev = column[index - 1] ?? null;
  const next = column[index] ?? null;

  if (prev && next && next.position - prev.position < MIN_GAP) {
    const ids = [...column.slice(0, index).map((c) => c.id), movedId, ...column.slice(index).map((c) => c.id)];
    return ids.map((id, i) => ({ id, position: i * GAP }));
  }
  return [{ id: movedId, position: positionBetween(prev?.position ?? null, next?.position ?? null) }];
}
