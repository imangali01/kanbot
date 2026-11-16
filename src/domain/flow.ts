import { addDays, dayNumber, localDate, TZ } from './dates';
import type { CfdPoint, FlowSignal, Status, TimeStats } from './types';

/** Событие журнала, важное для потока. Время — ISO-строка. */
export type FlowEvent =
  | { type: 'status'; at: string; from: Status; to: Status }
  | { type: 'blocked'; at: string }
  | { type: 'unblocked'; at: string };

export interface FlowTaskInput {
  status: Status;
  createdAt: string;
  doneAt: string | null;
  blocked: boolean;
  events: FlowEvent[];
}

/**
 * Отрезок пребывания в колонке. Время в мс, end = null — до сих пор.
 * assumed — момент входа неизвестен (журнала тогда ещё не было), начало выставлено по оценке.
 */
export interface Segment { status: Status; start: number; end: number | null; assumed: boolean }
export interface Timeline { created: number; segments: Segment[]; estimated: boolean }

const DAY_MS = 86_400_000;
const ms = (iso: string) => Date.parse(iso);

function byTime<T extends { at: string }>(events: T[]): T[] {
  return events.map((e, i) => ({ e, i })).sort((a, b) => ms(a.e.at) - ms(b.e.at) || a.i - b.i).map((x) => x.e);
}

/**
 * Восстанавливает путь задачи по колонкам.
 * - Начало — createdAt в Todo (так создаёт бот).
 * - Переходы — события status по времени.
 * - Если журнал начат, когда задача уже была не в Todo (from первого события ≠ todo),
 *   считаем, что она была там с создания, и помечаем начало как оценку.
 * - Если итоговый статус не совпал с журналом (старая задача без событий), дописываем
 *   переход: в Done — в момент doneAt, в остальные колонки — в начале последнего отрезка (оценка).
 *   Done-задача без журнала поэтому выглядит как Todo → Done, без выдуманного времени в работе.
 */
export function buildTimeline(t: FlowTaskInput): Timeline {
  const created = ms(t.createdAt);
  const moves = byTime(t.events.filter((e): e is Extract<FlowEvent, { type: 'status' }> => e.type === 'status'));
  const first: Status = moves.length ? moves[0].from : 'todo';
  const segments: Segment[] = [{ status: first, start: created, end: null, assumed: first !== 'todo' }];
  let estimated = first !== 'todo';

  const go = (status: Status, at: number, assumed: boolean) => {
    const cur = segments[segments.length - 1];
    if (cur.status === status) return;
    const when = Math.max(at, cur.start);
    cur.end = when;
    segments.push({ status, start: when, end: null, assumed });
  };
  for (const m of moves) go(m.to, ms(m.at), false);

  const last = segments[segments.length - 1];
  if (last.status !== t.status) {
    estimated = true;
    if (t.status === 'done' && t.doneAt) go('done', ms(t.doneAt), false);
    else go(t.status, last.start, true);
  }
  return { created, segments, estimated };
}

export function statusAt(tl: Timeline, at: number): Status | null {
  if (at < tl.created) return null;
  let status: Status | null = null;
  for (const s of tl.segments) if (s.start <= at) status = s.status;
  return status;
}

export const firstEntry = (tl: Timeline, status: Status): Segment | null => tl.segments.find((s) => s.status === status) ?? null;
export const lastEntry = (tl: Timeline, status: Status): Segment | null => [...tl.segments].reverse().find((s) => s.status === status) ?? null;

/**
 * Длительность в календарных днях по Алматы, включая оба края (как у Vacanti):
 * начато и закончено в один день — 1 день.
 */
export function spanDays(start: number, end: number): number {
  return Math.max(1, dayNumber(localDate(new Date(end))) - dayNumber(localDate(new Date(start))) + 1);
}

/**
 * Перцентиль методом nearest-rank: наименьшее значение, не меньше которого p% выборки.
 * Всегда возвращает реальное наблюдение (целые дни остаются целыми); пустая выборка — null.
 */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil((p / 100) * sorted.length)));
  return sorted[rank - 1];
}

export function timeStats(values: number[]): TimeStats {
  return { count: values.length, p50: percentile(values, 50), p85: percentile(values, 85), p95: percentile(values, 95) };
}

const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});

function offsetMs(at: number): number {
  const p = Object.fromEntries(partsFmt.formatToParts(new Date(at)).map((x) => [x.type, Number(x.value)]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - Math.floor(at / 1000) * 1000;
}

/** Момент 00:00 указанной даты по Алматы (учитывает исторические смены смещения). */
export function startOfLocalDay(date: string): number {
  const utc = dayNumber(date) * DAY_MS;
  return utc - offsetMs(utc - offsetMs(utc));
}

/** CFD: на конец каждого дня from..to — сколько задач в каждой колонке. Задачи, созданные позже дня, не считаются. */
export function buildCfd(timelines: Timeline[], from: string, to: string): CfdPoint[] {
  const marks = timelines.map((tl) => tl.segments.map((s) => ({ date: localDate(new Date(s.start)), status: s.status })));
  const out: CfdPoint[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const p: CfdPoint = { date, todo: 0, inProgress: 0, done: 0 };
    for (const m of marks) {
      let status: Status | null = null;
      for (const x of m) if (x.date <= date) status = x.status;
      if (status === 'todo') p.todo++;
      else if (status === 'in_progress') p.inProgress++;
      else if (status === 'done') p.done++;
    }
    out.push(p);
  }
  return out;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Простые выводы по форме CFD: сравниваем первую и последнюю четверть периода. */
export function cfdSignals(points: CfdPoint[]): FlowSignal[] {
  if (points.length < 3 || points.every((p) => p.todo + p.inProgress + p.done === 0)) return [];
  const w = Math.max(2, Math.round(points.length / 4));
  const head = points.slice(0, w);
  const tail = points.slice(-w);
  const grew = (k: 'todo' | 'inProgress', minDiff: number, ratio: number) => {
    const a = mean(head.map((p) => p[k]));
    const b = mean(tail.map((p) => p[k]));
    return b - a >= minDiff && b >= a * ratio;
  };
  const out: FlowSignal[] = [];
  if (points.some((p, i) => i > 0 && p.done < points[i - 1].done)) out.push('doneDrops');
  const flatSpan = Math.max(3, w);
  const ref = points[Math.max(0, points.length - 1 - flatSpan)];
  const last = points[points.length - 1];
  if (last.done <= ref.done && last.todo + last.inProgress > 0) out.push('doneFlat');
  if (grew('inProgress', 1, 1.5)) out.push('wipGrowing');
  const qa = mean(head.map((p) => p.todo));
  const qb = mean(tail.map((p) => p.todo));
  if (grew('todo', 2, 1.3)) out.push('queueGrowing');
  else if (qa - qb >= 2 && qb * 1.3 <= qa) out.push('queueShrinking');
  if (out.length === 0) out.push('steady');
  return out;
}

/** Блокировка: start = null — начало неизвестно (журнала не было), end = null — блок не снят. */
export interface BlockSpan { start: number | null; end: number | null }

export function buildBlocks(t: FlowTaskInput): BlockSpan[] {
  const out: BlockSpan[] = [];
  let open: number | null = null;
  let seen = false;
  for (const e of byTime(t.events)) {
    if (e.type === 'blocked') {
      if (open === null) open = ms(e.at);
      seen = true;
    } else if (e.type === 'unblocked') {
      if (open !== null) out.push({ start: open, end: ms(e.at) });
      else if (!seen) out.push({ start: null, end: ms(e.at) });
      open = null;
      seen = true;
    }
  }
  if (t.blocked) out.push({ start: open, end: null });
  else if (open !== null && t.status === 'done' && t.doneAt && ms(t.doneAt) >= open) out.push({ start: open, end: ms(t.doneAt) });
  return out;
}

export const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
