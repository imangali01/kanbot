import { addDays, dayNumber, localDate } from './dates';
import type { AnalyticsBucket, AnalyticsDays, AnalyticsPerson, AnalyticsView, AssigneeView } from './types';

export interface ClosedTask { stars: number; createdAt: string; doneAt: string; deadline: string; assignees: AssigneeView[] }

export const ANALYTICS_DAYS: AnalyticsDays[] = [7, 30, 90];
const NO_ASSIGNEE = { key: 'none', name: 'Без исполнителя' };

export function parseAnalyticsDays(raw: string | null): AnalyticsDays | null {
  if (raw === null) return 30;
  const n = Number(raw);
  return (ANALYTICS_DAYS as number[]).includes(n) ? (n as AnalyticsDays) : null;
}

function periods(days: AnalyticsDays, now: Date) {
  const to = localDate(now);
  const from = addDays(to, -(days - 1));
  const prevTo = addDays(from, -1);
  return { from, to, prevFrom: addDays(prevTo, -(days - 1)), prevTo };
}

/** Нижняя граница выборки для БД: начало прошлого периода с запасом в сутки на часовой пояс. */
export function analyticsSince(days: AnalyticsDays, now: Date): Date {
  return new Date(dayNumber(periods(days, now).prevFrom) * 86_400_000 - 86_400_000);
}

const zeros = () => [0, 0, 0, 0, 0];
const starIndex = (stars: number) => Math.min(5, Math.max(1, stars)) - 1;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function onTimePct(tasks: ClosedTask[]): number | null {
  if (tasks.length === 0) return null;
  const ok = tasks.filter((t) => localDate(new Date(t.doneAt)) <= t.deadline).length;
  return Math.round((ok / tasks.length) * 100);
}

const sumStars = (tasks: ClosedTask[]) => tasks.reduce((n, t) => n + t.stars, 0);

function buildBuckets(from: string, to: string, days: AnalyticsDays): AnalyticsBucket[] {
  const out: AnalyticsBucket[] = [];
  let start = from;
  while (start <= to) {
    let end = start;
    if (days !== 7) {
      // 1970-01-01 был четвергом: (dayNumber + 3) % 7 — номер дня недели с понедельника = 0
      const weekday = (dayNumber(start) + 3) % 7;
      end = addDays(start, 6 - weekday);
      if (end > to) end = to;
    }
    out.push({ start, end, byStars: zeros() });
    start = addDays(end, 1);
  }
  return out;
}

export function buildAnalytics(tasks: ClosedTask[], days: AnalyticsDays, now: Date): AnalyticsView {
  const { from, to, prevFrom, prevTo } = periods(days, now);
  const doneDate = (t: ClosedTask) => localDate(new Date(t.doneAt));
  const current = tasks.filter((t) => doneDate(t) >= from && doneDate(t) <= to);
  const previous = tasks.filter((t) => doneDate(t) >= prevFrom && doneDate(t) <= prevTo);

  const buckets = buildBuckets(from, to, days);
  const leadDays: number[][] = [[], [], [], [], []];
  const people = new Map<string, AnalyticsPerson>();

  for (const t of current) {
    const i = starIndex(t.stars);
    const done = doneDate(t);
    buckets.find((b) => done >= b.start && done <= b.end)!.byStars[i]++;
    leadDays[i].push(dayNumber(done) - dayNumber(localDate(new Date(t.createdAt))));
    const who = t.assignees.length ? t.assignees : [NO_ASSIGNEE];
    for (const a of who) {
      const p = people.get(a.key) ?? { key: a.key, name: a.name, byStars: zeros(), closed: 0, stars: 0 };
      p.byStars[i]++;
      p.closed++;
      p.stars += t.stars;
      people.set(a.key, p);
    }
  }

  return {
    days,
    from,
    to,
    kpi: {
      closed: { value: current.length, prev: previous.length },
      stars: { value: sumStars(current), prev: sumStars(previous) },
      onTime: { value: onTimePct(current), prev: onTimePct(previous) },
    },
    buckets,
    byStars: leadDays.map((d, i) => ({ stars: i + 1, closed: d.length, medianDays: median(d) })),
    people: [...people.values()].sort(
      (a, b) => Number(a.key === 'none') - Number(b.key === 'none') || b.stars - a.stars || b.closed - a.closed || a.name.localeCompare(b.name, 'ru'),
    ),
  };
}
