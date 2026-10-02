import { describe, expect, it } from 'vitest';
import { analyticsSince, buildAnalytics, isAssigneeFilter, parseAnalyticsDays, type ClosedTask } from './analytics';

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

describe('фильтр по исполнителю', () => {
  const tasks = [
    task({ stars: 5, assignees: [ann, bob] }),
    task({ stars: 1, assignees: [bob] }),
    task({ stars: 2, assignees: [] }),
    task({ stars: 4, assignees: [ann], doneAt: '2026-08-20T05:00:00Z' }), // прошлый период 30 дней: 04.08–02.09
  ];

  it('считает только задачи выбранного исполнителя, включая прошлый период', () => {
    const v = buildAnalytics(tasks, 30, NOW, 'u:1');
    expect(v.kpi.closed).toEqual({ value: 1, prev: 1 });
    expect(v.kpi.stars).toEqual({ value: 5, prev: 4 });
    expect(v.byStars[4].closed).toBe(1);
    expect(v.people.map((p) => p.key)).toEqual(['u:1']);
  });

  it('«Без исполнителя» — только задачи без исполнителей', () => {
    const v = buildAnalytics(tasks, 30, NOW, 'none');
    expect(v.kpi.closed.value).toBe(1);
    expect(v.kpi.stars.value).toBe(2);
  });

  it('список исполнителей для фильтра — из обоих периодов, не зависит от фильтра', () => {
    const all = buildAnalytics(tasks, 30, NOW).assignees;
    expect(all).toEqual([
      { key: 'u:1', name: 'Анна Ли' },
      { key: 'u:2', name: 'Боб Ким' },
      { key: 'none', name: 'Без исполнителя' },
    ]);
    expect(buildAnalytics(tasks, 30, NOW, 'u:2').assignees).toEqual(all);
  });

  it('проверка формата ключа фильтра', () => {
    expect(isAssigneeFilter('u:934716581')).toBe(true);
    expect(isAssigneeFilter('n:some_user')).toBe(true);
    expect(isAssigneeFilter('none')).toBe(true);
    expect(isAssigneeFilter('u:abc')).toBe(false);
    expect(isAssigneeFilter("n:x'; drop")).toBe(false);
  });
});
