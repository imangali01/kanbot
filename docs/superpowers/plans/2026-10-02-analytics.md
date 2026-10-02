# Аналитика доски — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** экран аналитики доски в Mini App: KPI, темп закрытия по сложности, разбивка по сложности и по людям за 7/30/90 дней.

**Architecture:** все расчёты — чистая функция `buildAnalytics` в `src/domain/analytics.ts` (юнит-тесты). Сервер достаёт закрытые задачи двух периодов тем же кодом, что и доску, и отдаёт `AnalyticsView` через `GET /api/app/chats/[chatId]/analytics?days=`. Клиент — новый экран `Analytics.tsx`, открывается кнопкой в шапке доски как отдельный `view` в `MiniApp.tsx`.

**Tech Stack:** Next.js 16 (Turbopack), TypeScript, Drizzle, CSS Modules, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-02-analytics-design.md`

## Global Constraints

- Часовой пояс расчётов — `Asia/Almaty`; даты как `YYYY-MM-DD` через `localDate`/`addDays` из `src/domain/dates.ts`.
- `src/domain/` — без БД, сети и `process.env`.
- Права — на сервере: `requireTgUser` → `getChat` (status `enabled`) → `canView`.
- Весь UI на русском.
- CSS Modules: Turbopack не раскрывает `composes` по цепочке — перечислять всех предков явно.
- Без новых npm-зависимостей; графики — div/CSS.
- Периоды только 7, 30, 90; по умолчанию 30.

## Review Focus

- Задача закрыта в 23:30 по Алматы (18:30 UTC) последнего дня периода — должна попасть в период (тест в Task 1).
- Задача с двумя исполнителями — в «По людям» у обоих, в KPI один раз (тест в Task 1).
- Задача без исполнителей — строка «Без исполнителя» (тест в Task 1).
- Пустой период и пустой прошлый период — KPI нули, `onTime` = `null`, без деления на ноль (тест в Task 1).
- `days=abc` / `days=365` в API — 400, а не 500 (Task 2, проверка через `parseAnalyticsDays` с тестом в Task 1).

---

### Task 1: доменная логика аналитики

**Files:**
- Modify: `src/domain/dates.ts` (экспортировать `dayNumber`)
- Modify: `src/domain/types.ts` (типы)
- Create: `src/domain/analytics.ts`
- Test: `src/domain/analytics.test.ts`

**Interfaces:**
- Produces:
  - `export function dayNumber(date: string): number` (dates.ts)
  - types.ts: `AnalyticsDays = 7 | 30 | 90`, `Kpi { value: number | null; prev: number | null }`, `AnalyticsBucket { start: string; end: string; byStars: number[] }`, `AnalyticsStarRow { stars: number; closed: number; medianDays: number | null }`, `AnalyticsPerson { key: string; name: string; byStars: number[]; closed: number; stars: number }`, `AnalyticsView { days; from; to; kpi: { closed: Kpi; stars: Kpi; onTime: Kpi }; buckets; byStars; people }`
  - analytics.ts: `ClosedTask { stars: number; createdAt: string; doneAt: string; deadline: string; assignees: AssigneeView[] }`, `ANALYTICS_DAYS`, `parseAnalyticsDays(raw: string | null): AnalyticsDays | null`, `analyticsSince(days, now): Date`, `buildAnalytics(tasks: ClosedTask[], days: AnalyticsDays, now: Date): AnalyticsView`
  - `byStars` массивы всегда длины 5, индекс = звёзды − 1.

- [ ] **Step 1: экспортировать `dayNumber`** — в `src/domain/dates.ts` заменить `function dayNumber(` на `export function dayNumber(`.

- [ ] **Step 2: типы** — дописать в конец `src/domain/types.ts`:

```ts
export type AnalyticsDays = 7 | 30 | 90;
export interface Kpi { value: number | null; prev: number | null }
export interface AnalyticsBucket { start: string; end: string; byStars: number[] }
export interface AnalyticsStarRow { stars: number; closed: number; medianDays: number | null }
export interface AnalyticsPerson { key: string; name: string; byStars: number[]; closed: number; stars: number }
export interface AnalyticsView {
  days: AnalyticsDays;
  from: string;
  to: string;
  kpi: { closed: Kpi; stars: Kpi; onTime: Kpi };
  buckets: AnalyticsBucket[];
  byStars: AnalyticsStarRow[];
  people: AnalyticsPerson[];
}
```

- [ ] **Step 3: написать падающие тесты** — `src/domain/analytics.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { analyticsSince, buildAnalytics, parseAnalyticsDays, type ClosedTask } from './analytics';

// 2026-10-02 12:00 Алматы (UTC+5), пятница
const NOW = new Date('2026-10-02T07:00:00Z');
const ann = { key: 'u:1', userId: 1, username: 'ann', name: 'Анна Ли' };
const bob = { key: 'u:2', userId: 2, username: 'bob', name: 'Боб Ким' };

function task(over: Partial<ClosedTask> = {}): ClosedTask {
  return { stars: 3, createdAt: '2026-09-28T05:00:00Z', doneAt: '2026-10-01T05:00:00Z', deadline: '2026-10-01', assignees: [ann], ...over };
}

describe('parseAnalyticsDays', () => {
  it('принимает только 7, 30, 90; по умолчанию 30', () => {
    expect(parseAnalyticsDays(null)).toBe(30);
    expect(parseAnalyticsDays('7')).toBe(7);
    expect(parseAnalyticsDays('90')).toBe(90);
    expect(parseAnalyticsDays('365')).toBeNull();
    expect(parseAnalyticsDays('abc')).toBeNull();
  });
});

describe('analyticsSince', () => {
  it('захватывает весь прошлый период с запасом', () => {
    // период 7 дней: 2026-09-26..2026-10-02, прошлый: 2026-09-19..2026-09-25
    expect(analyticsSince(7, NOW).getTime()).toBeLessThanOrEqual(new Date('2026-09-18T19:00:00Z').getTime());
  });
});

describe('buildAnalytics', () => {
  it('границы периода по Алматы', () => {
    const v = buildAnalytics([
      task({ doneAt: '2026-10-02T18:30:00Z' }), // 23:30 2 октября по Алматы — внутри
      task({ doneAt: '2026-09-25T18:59:00Z' }), // 23:59 25 сентября — прошлый период
      task({ doneAt: '2026-09-25T19:00:00Z' }), // 00:00 26 сентября — внутри
    ], 7, NOW);
    expect(v.from).toBe('2026-09-26');
    expect(v.to).toBe('2026-10-02');
    expect(v.kpi.closed).toEqual({ value: 2, prev: 1 });
  });

  it('звёзды, вовремя и дельты', () => {
    const v = buildAnalytics([
      task({ stars: 5, deadline: '2026-10-01' }),                                  // вовремя (в день дедлайна)
      task({ stars: 2, deadline: '2026-09-30' }),                                  // просрочено
      task({ stars: 1, doneAt: '2026-09-20T05:00:00Z', deadline: '2026-09-25' }),  // прошлый период, вовремя
    ], 7, NOW);
    expect(v.kpi.stars).toEqual({ value: 7, prev: 1 });
    expect(v.kpi.onTime).toEqual({ value: 50, prev: 100 });
  });

  it('пустые периоды без деления на ноль', () => {
    const v = buildAnalytics([], 30, NOW);
    expect(v.kpi.closed).toEqual({ value: 0, prev: 0 });
    expect(v.kpi.stars).toEqual({ value: 0, prev: 0 });
    expect(v.kpi.onTime).toEqual({ value: null, prev: null });
    expect(v.byStars.map((r) => r.medianDays)).toEqual([null, null, null, null, null]);
    expect(v.people).toEqual([]);
  });

  it('7 дней — корзины по дням', () => {
    const v = buildAnalytics([task({ stars: 4 })], 7, NOW);
    expect(v.buckets).toHaveLength(7);
    expect(v.buckets[0]).toEqual({ start: '2026-09-26', end: '2026-09-26', byStars: [0, 0, 0, 0, 0] });
    expect(v.buckets[5]).toEqual({ start: '2026-10-01', end: '2026-10-01', byStars: [0, 0, 0, 1, 0] });
  });

  it('30 дней — корзины по неделям с понедельника, края обрезаны периодом', () => {
    const v = buildAnalytics([], 30, NOW);
    // период 2026-09-03 (чт) .. 2026-10-02 (пт)
    expect(v.buckets[0]).toMatchObject({ start: '2026-09-03', end: '2026-09-06' });
    expect(v.buckets[1]).toMatchObject({ start: '2026-09-07', end: '2026-09-13' });
    expect(v.buckets.at(-1)).toMatchObject({ start: '2026-09-28', end: '2026-10-02' });
    expect(v.buckets).toHaveLength(5);
  });

  it('медиана дней до закрытия по сложности', () => {
    const v = buildAnalytics([
      task({ stars: 3, createdAt: '2026-09-30T05:00:00Z' }), // 1 день
      task({ stars: 3, createdAt: '2026-09-28T05:00:00Z' }), // 3 дня
      task({ stars: 3, createdAt: '2026-09-21T05:00:00Z' }), // 10 дней
      task({ stars: 5, createdAt: '2026-09-29T05:00:00Z' }), // 2
      task({ stars: 5, createdAt: '2026-09-26T05:00:00Z' }), // 5
    ], 30, NOW);
    expect(v.byStars[2]).toEqual({ stars: 3, closed: 3, medianDays: 3 });
    expect(v.byStars[4]).toEqual({ stars: 5, closed: 2, medianDays: 3.5 });
    expect(v.byStars[0]).toEqual({ stars: 1, closed: 0, medianDays: null });
  });

  it('по людям: двое исполнителей — у обоих, без исполнителя — отдельная строка, сортировка по звёздам', () => {
    const v = buildAnalytics([
      task({ stars: 5, assignees: [ann, bob] }),
      task({ stars: 1, assignees: [bob] }),
      task({ stars: 2, assignees: [] }),
    ], 30, NOW);
    expect(v.kpi.closed.value).toBe(3);
    expect(v.people).toEqual([
      { key: 'u:2', name: 'Боб Ким', byStars: [1, 0, 0, 0, 1], closed: 2, stars: 6 },
      { key: 'u:1', name: 'Анна Ли', byStars: [0, 0, 0, 0, 1], closed: 1, stars: 5 },
      { key: 'none', name: 'Без исполнителя', byStars: [0, 1, 0, 0, 0], closed: 1, stars: 2 },
    ]);
  });
});
```

- [ ] **Step 4: убедиться, что тесты падают** — Run: `npx vitest run src/domain/analytics.test.ts` · Expected: FAIL, модуль `./analytics` не найден.

- [ ] **Step 5: реализация** — `src/domain/analytics.ts`:

```ts
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
```

- [ ] **Step 6: тесты проходят** — Run: `npm test` · Expected: все тесты PASS, включая новые.

- [ ] **Step 7: коммит**

```bash
git add src/domain/dates.ts src/domain/types.ts src/domain/analytics.ts src/domain/analytics.test.ts
git commit -m "feat(analytics): domain calculations for board analytics"
```

---

### Task 2: сервер и API

**Files:**
- Modify: `src/server/tasks.ts:24` (`fetchCards` — фильтр по `doneAt`), добавить `loadAnalytics`
- Create: `src/app/api/app/chats/[chatId]/analytics/route.ts`

**Interfaces:**
- Consumes: `buildAnalytics`, `analyticsSince`, `parseAnalyticsDays`, `ClosedTask` (Task 1)
- Produces: `loadAnalytics(chat: ChatRow, days: AnalyticsDays, now: Date): Promise<AnalyticsView>`; `GET /api/app/chats/:chatId/analytics?days=7|30|90` → `AnalyticsView` JSON

- [ ] **Step 1: фильтр в `fetchCards`** — сигнатура `async function fetchCards(chatId: number, taskIds?: number[], doneSince?: Date)`; условие `where`:

```ts
    .where(and(
      eq(tasks.chatId, chatId),
      taskIds ? inArray(tasks.id, taskIds) : undefined,
      doneSince ? and(eq(tasks.status, 'done'), gte(tasks.doneAt, doneSince)) : undefined,
    ));
```

Добавить `gte` в импорт из `drizzle-orm`.

- [ ] **Step 2: `loadAnalytics`** — в конец `src/server/tasks.ts`:

```ts
export async function loadAnalytics(chat: ChatRow, days: AnalyticsDays, now: Date): Promise<AnalyticsView> {
  const items = await fetchCards(chat.id, undefined, analyticsSince(days, now));
  const closed: ClosedTask[] = items.map(({ row, assignees }) => ({
    stars: row.stars,
    createdAt: row.createdAt.toISOString(),
    doneAt: row.doneAt!.toISOString(),
    deadline: row.deadline,
    assignees,
  }));
  return buildAnalytics(closed, days, now);
}
```

Импорты: `import { analyticsSince, buildAnalytics, type ClosedTask } from '@/domain/analytics';`, добавить `AnalyticsDays, AnalyticsView` в импорт типов из `@/domain/types`.

- [ ] **Step 3: роут** — `src/app/api/app/chats/[chatId]/analytics/route.ts`:

```ts
import { parseAnalyticsDays } from '@/domain/analytics';
import { canView } from '@/domain/permissions';
import { getActor, getChat } from '@/server/chats';
import { AccessError } from '@/server/errors';
import { handle, requireTgUser, toId, type Params } from '@/server/http';
import { loadAnalytics } from '@/server/tasks';

export const dynamic = 'force-dynamic';

export function GET(req: Request, { params }: Params<'chatId'>) {
  return handle(async () => {
    const user = await requireTgUser(req);
    const days = parseAnalyticsDays(new URL(req.url).searchParams.get('days'));
    if (!days) throw new AccessError(400, 'Период: 7, 30 или 90 дней');
    const chat = await getChat(toId((await params).chatId));
    if (!chat || chat.status !== 'enabled') throw new AccessError(404, 'Доска не найдена');
    const actor = await getActor(chat, user.id);
    if (!canView(actor)) throw new AccessError(403, 'Вы не участник этой группы');
    return loadAnalytics(chat, days, new Date());
  });
}
```

- [ ] **Step 4: проверка** — Run: `npm run typecheck && npm test` · Expected: без ошибок, тесты PASS.

- [ ] **Step 5: коммит**

```bash
git add src/server/tasks.ts "src/app/api/app/chats/[chatId]/analytics/route.ts"
git commit -m "feat(analytics): analytics API endpoint"
```

---

### Task 3: экран аналитики

**Files:**
- Modify: `src/miniapp/icons.tsx` (`IconChart`)
- Create: `src/miniapp/Analytics.tsx`
- Modify: `src/miniapp/Board.tsx` (кнопка, проп `onAnalytics`)
- Modify: `src/miniapp/MiniApp.tsx` (view `analytics`)
- Modify: `src/app/globals.css` (токены цветов сложности)
- Modify: `src/miniapp/miniapp.module.css` (стили экрана)

**Interfaces:**
- Consumes: `AnalyticsView`, `AnalyticsDays` (Task 1); `GET /api/app/chats/:chatId/analytics?days=` (Task 2)
- Produces: `Analytics({ chatId, title, onBack })`; `Board` получает проп `onAnalytics: (title: string) => void`

- [ ] **Step 1: иконка** — в `src/miniapp/icons.tsx`:

```tsx
export const IconChart = (p: P) => (
  <Icon {...p}><path d="M4.5 19.5h15" /><rect x="6" y="11" width="3" height="6" rx="1" /><rect x="10.5" y="6.5" width="3" height="10.5" rx="1" /><rect x="15" y="9" width="3" height="8" rx="1" /></Icon>
);
```

- [ ] **Step 2: цвета сложности** — в `src/app/globals.css` в `:root` добавить `--s1: #f6dfa6; --s2: #efc565; --s3: #e5a21a; --s4: #b97a0c; --s5: #7d5108;`, в `:root[data-theme='dark']` — `--s1: #5c4413; --s2: #8a6417; --s3: #c58c1c; --s4: #f0b43a; --s5: #ffd98a;`. Перед этим загрузить скилл `dataviz` и прогнать его валидатор контраста для этих шкал; при провале скорректировать значения.

- [ ] **Step 3: экран** — `src/miniapp/Analytics.tsx`:

```tsx
'use client';
import { useCallback, useEffect, useState } from 'react';
import type { AnalyticsDays, AnalyticsView, Kpi } from '@/domain/types';
import { api, errorText } from './api';
import { Avatar } from './Avatar';
import { webApp } from './telegram';
import s from './miniapp.module.css';

const PERIODS: AnalyticsDays[] = [7, 30, 90];
const STAR_COLORS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)'];
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const short = (d: string) => `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
const range = (a: string, b: string) => (a === b ? short(a) : `${short(a)} – ${short(b)}`);
const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
};

function Delta({ kpi, unit = '' }: { kpi: Kpi; unit?: string }) {
  if (kpi.value === null || kpi.prev === null || kpi.prev === 0) return <span className={s.kpiDeltaMuted}>—</span>;
  const d = kpi.value - kpi.prev;
  if (d === 0) return <span className={s.kpiDeltaMuted}>без изменений</span>;
  return <span className={d > 0 ? s.kpiDeltaUp : s.kpiDeltaDown}>{d > 0 ? '+' : '−'}{Math.abs(d)}{unit}</span>;
}

function StackBar({ byStars, total, vertical }: { byStars: number[]; total: number; vertical?: boolean }) {
  return (
    <div className={vertical ? s.stackV : s.stackH}>
      {byStars.map((n, i) => n > 0 && (
        <span key={i} style={{ [vertical ? 'height' : 'width']: `${(n / total) * 100}%`, background: STAR_COLORS[i] }} />
      ))}
    </div>
  );
}

export function Analytics({ chatId, title, onBack }: { chatId: number; title: string; onBack: () => void }) {
  const [days, setDays] = useState<AnalyticsDays>(30);
  const [data, setData] = useState<AnalyticsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api<AnalyticsView>(`/api/app/chats/${chatId}/analytics?days=${days}`));
    } catch (e) {
      setError(errorText(e));
    }
  }, [chatId, days]);

  useEffect(() => { setPicked(null); void load(); }, [load]);
  useEffect(() => {
    const back = webApp()?.BackButton;
    if (!back) return;
    back.show();
    back.onClick(onBack);
    return () => back.offClick(onBack);
  }, [onBack]);

  const maxBucket = data ? Math.max(1, ...data.buckets.map((b) => b.byStars.reduce((a, n) => a + n, 0))) : 1;
  const maxStarRow = data ? Math.max(1, ...data.byStars.map((r) => r.closed)) : 1;
  const maxPerson = data ? Math.max(1, ...data.people.map((p) => p.closed)) : 1;
  const bucket = data && picked !== null ? data.buckets[picked] : null;

  return (
    <div className={s.analytics}>
      <header className={s.anHead}>
        <div className={s.anTitles}>
          <h1 className={s.title}>Аналитика</h1>
          <span className={s.muted}>{title}</span>
        </div>
        <div className={s.seg} role="radiogroup" aria-label="Период">
          {PERIODS.map((p) => (
            <button key={p} role="radio" aria-checked={days === p} className={days === p ? s.segOn_todo : s.segBtn} onClick={() => setDays(p)}>{p} дн</button>
          ))}
        </div>
      </header>

      {error && (
        <div className={s.center}>{error}<br /><button className={s.chipBtn} onClick={() => void load()}>Повторить</button></div>
      )}
      {!error && !data && <div className={s.skeletons} aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className={s.skel} />)}</div>}

      {data && (
        <>
          <div className={s.kpis}>
            <div className={s.kpi}><span className={s.kpiLabel}>Закрыто</span><span className={s.kpiValue}>{data.kpi.closed.value}</span><Delta kpi={data.kpi.closed} /></div>
            <div className={s.kpi}><span className={s.kpiLabel}>Звёзды</span><span className={s.kpiValue}>{data.kpi.stars.value}</span><Delta kpi={data.kpi.stars} /></div>
            <div className={s.kpi}><span className={s.kpiLabel}>Вовремя</span><span className={s.kpiValue}>{data.kpi.onTime.value === null ? '—' : `${data.kpi.onTime.value}%`}</span><Delta kpi={data.kpi.onTime} unit="%" /></div>
          </div>

          {data.kpi.closed.value === 0 ? (
            <div className={s.anEmpty}>За этот период закрытых задач нет</div>
          ) : (
            <>
              <section className={s.anCard}>
                <h2 className={s.anH2}>Темп</h2>
                <div className={s.chart}>
                  {data.buckets.map((b, i) => {
                    const total = b.byStars.reduce((a, n) => a + n, 0);
                    return (
                      <button key={b.start} className={picked === i ? s.colOn : s.col} aria-label={`${range(b.start, b.end)}: ${total}`} onClick={() => setPicked(picked === i ? null : i)}>
                        <span className={s.colTrack} style={{ height: `${(total / maxBucket) * 100}%` }}>
                          {total > 0 && <StackBar byStars={b.byStars} total={total} vertical />}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className={s.axis}><span>{short(data.from)}</span><span>{short(data.to)}</span></div>
                {bucket ? (
                  <div className={s.pickedInfo}>
                    <b>{range(bucket.start, bucket.end)}</b>
                    {bucket.byStars.map((n, i) => n > 0 && <span key={i} className={s.legendItem}><i style={{ background: STAR_COLORS[i] }} />★{i + 1}: {n}</span>)}
                    {bucket.byStars.every((n) => n === 0) && <span className={s.muted}>ничего не закрыто</span>}
                  </div>
                ) : (
                  <div className={s.legend}>{STAR_COLORS.map((c, i) => <span key={i} className={s.legendItem}><i style={{ background: c }} />★{i + 1}</span>)}</div>
                )}
              </section>

              <section className={s.anCard}>
                <h2 className={s.anH2}>По сложности</h2>
                {data.byStars.map((r) => (
                  <div key={r.stars} className={s.starRow}>
                    <span className={s.starLabel}>★{r.stars}</span>
                    <span className={s.barTrack}><span style={{ width: `${(r.closed / maxStarRow) * 100}%`, background: STAR_COLORS[r.stars - 1] }} /></span>
                    <span className={s.starNum}>{r.closed}</span>
                    <span className={s.starDays}>{r.medianDays === null ? '—' : `${r.medianDays} дн`}</span>
                  </div>
                ))}
                <p className={s.anNote}>Справа — медиана дней от создания до закрытия</p>
              </section>

              <section className={s.anCard}>
                <h2 className={s.anH2}>По людям</h2>
                {data.people.map((p) => (
                  <div key={p.key} className={s.personRow}>
                    <Avatar name={p.name} size={28} />
                    <div className={s.personBody}>
                      <div className={s.personHead}>
                        <span className={s.personName}>{p.name}</span>
                        <span className={s.muted}>{p.closed} {plural(p.closed, 'задача', 'задачи', 'задач')} · {p.stars} ★</span>
                      </div>
                      <span className={s.barTrack}><span style={{ width: `${(p.closed / maxPerson) * 100}%`, display: 'flex' }}><StackBar byStars={p.byStars} total={p.closed} /></span></span>
                    </div>
                  </div>
                ))}
                <p className={s.anNote}>Задача с несколькими исполнителями учитывается у каждого</p>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: стили** — дописать в `src/miniapp/miniapp.module.css`:

```css
/* ───── аналитика ───── */
.analytics { padding: 16px 16px calc(24px + env(safe-area-inset-bottom)); }
.anHead { display: flex; flex-direction: column; gap: 12px; margin-bottom: 14px; }
.anTitles { display: flex; flex-direction: column; gap: 2px; }
.analytics .seg { max-width: none; }
.kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
.kpi { display: flex; flex-direction: column; gap: 2px; padding: 12px; border-radius: 14px; background: var(--surface); box-shadow: inset 0 0 0 1px var(--edge); min-width: 0; }
.kpiLabel { font-size: 12.5px; color: var(--ink-2); }
.kpiValue { font-size: 24px; font-weight: 650; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.kpiDeltaMuted { font-size: 12px; color: var(--ink-3); }
.kpiDeltaUp { font-size: 12px; font-weight: 600; color: var(--st-done); }
.kpiDeltaDown { font-size: 12px; font-weight: 600; color: var(--danger); }
.anCard { margin-bottom: 12px; padding: 14px; border-radius: 16px; background: var(--surface); box-shadow: inset 0 0 0 1px var(--edge); }
.anH2 { margin: 0 0 12px; font-size: 15px; font-weight: 650; }
.anEmpty { padding: 40px 16px; text-align: center; font-size: 13px; font-style: italic; color: var(--ink-3); }
.anNote { margin: 10px 0 0; font-size: 12px; color: var(--ink-3); }
.chart { display: flex; align-items: flex-end; gap: 4px; height: 140px; }
.col { flex: 1; display: flex; align-items: flex-end; height: 100%; padding: 0; border: 0; border-radius: 6px; background: transparent; cursor: pointer; }
.colOn { composes: col; background: var(--surface-2); }
.colTrack { display: flex; width: 100%; min-height: 0; }
.stackV { display: flex; flex-direction: column-reverse; width: 100%; height: 100%; border-radius: 5px; overflow: hidden; gap: 1px; }
.stackH { display: flex; width: 100%; height: 100%; border-radius: 4px; overflow: hidden; gap: 1px; }
.axis { display: flex; justify-content: space-between; margin-top: 6px; font-size: 11.5px; color: var(--ink-3); }
.legend, .pickedInfo { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; margin-top: 10px; font-size: 12.5px; color: var(--ink-2); }
.legendItem { display: inline-flex; align-items: center; gap: 5px; }
.legendItem i { width: 10px; height: 10px; border-radius: 3px; }
.starRow { display: grid; grid-template-columns: 30px 1fr 28px 48px; align-items: center; gap: 8px; height: 30px; font-size: 13.5px; }
.starLabel { color: var(--ink-2); font-weight: 600; }
.barTrack { display: flex; height: 10px; border-radius: 5px; background: var(--surface-2); overflow: hidden; }
.barTrack > span { display: block; height: 100%; border-radius: 5px; }
.starNum { text-align: right; font-weight: 650; font-variant-numeric: tabular-nums; }
.starDays { text-align: right; color: var(--ink-3); font-variant-numeric: tabular-nums; }
.personRow { display: flex; align-items: center; gap: 10px; padding: 6px 0; }
.personBody { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.personHead { display: flex; justify-content: space-between; gap: 8px; font-size: 13.5px; }
.personName { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 550; }
```

`.colOn` композирует только `.col` — у `.col` своих `composes` нет, цепочки нет.

- [ ] **Step 5: кнопка на доске** — в `src/miniapp/Board.tsx`: сигнатура `Board({ chatId, openTaskNumber, onBack, onAnalytics }: { …; onAnalytics: (title: string) => void })`; импорт `IconChart`; в `titleRow` перед кнопкой «Обновить»:

```tsx
          <button className={s.iconBtn} onClick={() => onAnalytics(board.chat.title || 'Доска')} aria-label="Аналитика">
            <IconChart />
          </button>
```

- [ ] **Step 6: маршрут** — в `src/miniapp/MiniApp.tsx`: тип `View` дополнить `| { kind: 'analytics'; chatId: number; title: string }`; импорт `Analytics`; в рендере ветку для доски заменить на:

```tsx
      ) : view.kind === 'analytics' ? (
        <Analytics chatId={view.chatId} title={view.title} onBack={() => setView({ kind: 'board', chatId: view.chatId, taskNumber: null })} />
      ) : (
        <Board chatId={view.chatId} openTaskNumber={view.taskNumber} onBack={toChats} onAnalytics={(title) => setView({ kind: 'analytics', chatId: view.chatId, title })} />
      )}
```

- [ ] **Step 7: проверка сборки** — Run: `npm run typecheck && npm test && npm run build` · Expected: без ошибок. Затем `grep -rhoE '(colOn|segOn_todo|kpi):"[^"]+"' .next/static` — у `colOn` есть класс `col`.

- [ ] **Step 8: коммит**

```bash
git add src/miniapp src/app/globals.css
git commit -m "feat(analytics): analytics screen in mini app"
```

---

### Task 4: скриншоты и деплой

- [ ] **Step 1: скриншоты** — собрать стенд (esbuild + Edge headless, как для карточки) с моковым `AnalyticsView`: 30 дней со смесью звёзд и 3 исполнителями, 7 дней, пустой период; светлая и тёмная тема, ширина 375px. Показать пользователю.
- [ ] **Step 2: правки по замечаниям**, повтор Step 1.
- [ ] **Step 3: после «ок» пользователя** — `git push origin main` и `npx vercel deploy --prod --yes`; проверить, что `https://kanbot-ruby.vercel.app/api/app/chats/1/analytics?days=30` без авторизации отвечает 401.
