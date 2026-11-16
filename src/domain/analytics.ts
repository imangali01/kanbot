import { addDays, dayNumber, localDate } from './dates';
import {
  buildBlocks, buildCfd, buildTimeline, cfdSignals, firstEntry, lastEntry, overlap, spanDays, startOfLocalDay, timeStats,
  type FlowTaskInput, type Timeline,
} from './flow';
import type {
  AgingItem, AnalyticsDays, AnalyticsPerson, AnalyticsView, AssigneeView, BlockedItem, CycleItem, ThroughputBucket,
} from './types';

export interface AnalyticsTask extends FlowTaskInput {
  id: number;
  number: number;
  text: string;
  stars: number;
  deadline: string;
  assignees: AssigneeView[];
}

export const ANALYTICS_DAYS: AnalyticsDays[] = [7, 30, 90];
/** Порог «зависания» карточки, пока закрытых задач мало для 85-го перцентиля. */
export const DEFAULT_SLE_DAYS = 7;
/** Сколько задач с известным временем цикла нужно, чтобы считать порог по данным. */
export const MIN_SLE_SAMPLE = 5;

const NO_ASSIGNEE = { key: 'none', name: 'Без исполнителя' };
const ASSIGNEE_FILTER = /^(u:\d{1,20}|n:[A-Za-z0-9_]{1,64}|none)$/;
const TEXT_MAX = 120;

export function isAssigneeFilter(raw: string): boolean {
  return ASSIGNEE_FILTER.test(raw);
}

export function parseAnalyticsDays(raw: string | null): AnalyticsDays | null {
  if (raw === null) return 30;
  const n = Number(raw);
  return (ANALYTICS_DAYS as number[]).includes(n) ? (n as AnalyticsDays) : null;
}

const matches = (t: AnalyticsTask, assignee: string | null) =>
  assignee === null || (assignee === NO_ASSIGNEE.key ? t.assignees.length === 0 : t.assignees.some((a) => a.key === assignee));

function periods(days: AnalyticsDays, now: Date) {
  const to = localDate(now);
  const from = addDays(to, -(days - 1));
  const prevTo = addDays(from, -1);
  return { from, to, prevFrom: addDays(prevTo, -(days - 1)), prevTo };
}

/**
 * Нижняя граница для БД: начало прошлого периода с запасом в сутки на часовой пояс.
 * Задачам, закрытым раньше, журнал не нужен — весь период они просто лежат в Done.
 */
export function analyticsSince(days: AnalyticsDays, now: Date): Date {
  return new Date(dayNumber(periods(days, now).prevFrom) * 86_400_000 - 86_400_000);
}

function buildBuckets(from: string, to: string, days: AnalyticsDays): ThroughputBucket[] {
  const out: ThroughputBucket[] = [];
  let start = from;
  while (start <= to) {
    let end = start;
    if (days !== 7) {
      // 1970-01-01 был четвергом: (dayNumber + 3) % 7 — номер дня недели с понедельника = 0
      const weekday = (dayNumber(start) + 3) % 7;
      end = addDays(start, 6 - weekday);
      if (end > to) end = to;
    }
    out.push({ start, end, closed: 0, stars: 0 });
    start = addDays(end, 1);
  }
  return out;
}

const ref = (t: AnalyticsTask) => ({ id: t.id, number: t.number, text: t.text.length > TEXT_MAX ? `${t.text.slice(0, TEXT_MAX - 1)}…` : t.text });
const pct = (part: number, whole: number) => (whole === 0 ? null : Math.round((part / whole) * 100));
const round1 = (n: number) => Math.round(n * 10) / 10;
const byName = (a: { key: string; name: string }, b: { key: string; name: string }) =>
  Number(a.key === 'none') - Number(b.key === 'none') || a.name.localeCompare(b.name, 'ru');

interface Closed { task: AnalyticsTask; tl: Timeline; doneMs: number; doneDate: string }

/** Время цикла: от первого входа в In progress до Done. null — в работе не была или вход в работу не известен. */
function cycleDays(c: Closed): number | null {
  const start = firstEntry(c.tl, 'in_progress');
  if (!start || start.assumed || start.start > c.doneMs) return null;
  return spanDays(start.start, c.doneMs);
}

export function buildAnalytics(all: AnalyticsTask[], days: AnalyticsDays, now: Date, assignee: string | null = null): AnalyticsView {
  const { from, to, prevFrom, prevTo } = periods(days, now);
  const nowMs = now.getTime();
  const today = to;

  const closedOf = (t: AnalyticsTask, tl: Timeline): Closed | null => {
    if (t.status !== 'done') return null;
    const doneMs = t.doneAt ? Date.parse(t.doneAt) : tl.segments[tl.segments.length - 1].start;
    return { task: t, tl, doneMs, doneDate: localDate(new Date(doneMs)) };
  };

  // варианты фильтра: все, кто есть у открытых задач и у закрытых за оба периода
  const options = new Map<string, string>();
  const withTimeline = all.map((t) => ({ t, tl: buildTimeline(t) }));
  for (const { t, tl } of withTimeline) {
    const c = closedOf(t, tl);
    if (c && c.doneDate < prevFrom) continue;
    for (const a of t.assignees.length ? t.assignees : [NO_ASSIGNEE]) options.set(a.key, a.name);
  }

  const picked = withTimeline.filter(({ t }) => matches(t, assignee));
  const closedAll = picked.map(({ t, tl }) => closedOf(t, tl)).filter((c): c is Closed => c !== null);
  const current = closedAll.filter((c) => c.doneDate >= from && c.doneDate <= to);
  const previous = closedAll.filter((c) => c.doneDate >= prevFrom && c.doneDate <= prevTo);
  const open = picked.filter(({ t }) => t.status !== 'done');

  // CFD
  const points = buildCfd(picked.map((x) => x.tl), from, to);
  const avgWip = points.reduce((n, p) => n + p.inProgress, 0) / points.length;
  const perDay = current.length / days;

  // пропускная способность
  const throughput = buildBuckets(from, to, days);
  for (const c of current) {
    const b = throughput.find((x) => c.doneDate >= x.start && c.doneDate <= x.end)!;
    b.closed++;
    b.stars += c.task.stars;
  }
  const stars = (cs: Closed[]) => cs.reduce((n, c) => n + c.task.stars, 0);

  // время цикла и срок выполнения
  const items: CycleItem[] = current
    .map((c) => ({
      ...ref(c.task),
      doneDate: c.doneDate,
      cycleDays: cycleDays(c),
      leadDays: spanDays(c.tl.created, c.doneMs),
      estimated: c.tl.estimated,
    }))
    .sort((a, b) => a.doneDate.localeCompare(b.doneDate) || a.number - b.number);
  const cycleValues = items.flatMap((i) => (i.cycleDays === null ? [] : [i.cycleDays]));
  const cycle = timeStats(cycleValues);
  const lead = timeStats(items.map((i) => i.leadDays));
  const prevCycle = timeStats(previous.flatMap((c) => { const d = cycleDays(c); return d === null ? [] : [d]; }));

  // WIP и возраст карточек в работе
  const sleFromData = cycle.count >= MIN_SLE_SAMPLE;
  const sle = sleFromData ? cycle.p85! : DEFAULT_SLE_DAYS;
  const aging: AgingItem[] = open
    .filter(({ t }) => t.status === 'in_progress')
    .map(({ t, tl }) => {
      const since = lastEntry(tl, 'in_progress')!;
      const ageDays = spanDays(since.start, nowMs);
      return { ...ref(t), ageDays, estimated: since.assumed, overSle: ageDays > sle, blocked: t.blocked, assignees: t.assignees.map((a) => a.name) };
    })
    .sort((a, b) => b.ageDays - a.ageDays || a.number - b.number);

  // блокировки: доля заблокированного времени от времени, которое задачи были открыты в периоде
  const windowStart = startOfLocalDay(from);
  let openMs = 0;
  let blockedMs = 0;
  let blockedTasks = 0;
  let unknownStart = 0;
  const blockedNow: BlockedItem[] = [];
  for (const { t, tl } of picked) {
    for (const s of tl.segments) if (s.status !== 'done') openMs += overlap(s.start, s.end ?? nowMs, windowStart, nowMs);
    let touched = false;
    const spans = buildBlocks(t);
    for (const b of spans) {
      if (b.start === null) {
        if (b.end === null || b.end >= windowStart) { unknownStart++; touched = true; }
        continue;
      }
      const o = overlap(b.start, b.end ?? nowMs, windowStart, nowMs);
      if (o > 0) touched = true;
      blockedMs += o;
    }
    if (touched) blockedTasks++;
    if (t.blocked && t.status !== 'done') {
      const cur = spans[spans.length - 1];
      blockedNow.push({ ...ref(t), status: t.status, days: cur?.start != null ? spanDays(cur.start, nowMs) : null });
    }
  }
  blockedNow.sort((a, b) => (b.days ?? Infinity) - (a.days ?? Infinity) || a.number - b.number);

  // нагрузка по людям
  const people = new Map<string, AnalyticsPerson>();
  const person = (a: { key: string; name: string }) => {
    const p = people.get(a.key) ?? { key: a.key, name: a.name, closed: 0, stars: 0, wip: 0 };
    people.set(a.key, p);
    return p;
  };
  const who = (t: AnalyticsTask) => (t.assignees.length ? t.assignees : [NO_ASSIGNEE]).filter((a) => assignee === null || a.key === assignee);
  for (const c of current) for (const a of who(c.task)) { const p = person(a); p.closed++; p.stars += c.task.stars; }
  for (const { t } of open) if (t.status === 'in_progress') for (const a of who(t)) person(a).wip++;

  const onTime = (cs: Closed[]) => cs.filter((c) => c.doneDate <= c.task.deadline).length;

  return {
    days,
    from,
    to,
    total: picked.length,
    kpi: {
      closed: { value: current.length, prev: previous.length },
      stars: { value: stars(current), prev: stars(previous) },
      cycleP50: { value: cycle.p50, prev: prevCycle.p50 },
      onTime: { value: pct(onTime(current), current.length), prev: pct(onTime(previous), previous.length) },
    },
    cfd: {
      points,
      avgWip: round1(avgWip),
      throughputPerWeek: round1(perDay * 7),
      littleDays: perDay > 0 ? round1(avgWip / perDay) : null,
      signals: cfdSignals(points),
    },
    throughput,
    cycle: {
      cycle,
      lead,
      items,
      withoutProgress: items.filter((i) => i.cycleDays === null).length,
      estimated: items.filter((i) => i.estimated).length,
    },
    wip: { now: aging.length, queue: open.filter(({ t }) => t.status === 'todo').length, sle, sleFromData, aging },
    blocks: { now: blockedNow, share: openMs > 0 ? blockedMs / openMs : null, tasks: blockedTasks, unknownStart },
    deadlines: {
      closed: current.length,
      onTime: onTime(current),
      overdueOpen: open.filter(({ t }) => t.deadline < today).length,
    },
    people: [...people.values()].sort(
      (a, b) => Number(a.key === 'none') - Number(b.key === 'none') || b.closed - a.closed || b.stars - a.stars || b.wip - a.wip || a.name.localeCompare(b.name, 'ru'),
    ),
    assignees: [...options].map(([key, name]) => ({ key, name })).sort(byName),
  };
}
