import { describe, expect, it } from 'vitest';
import { analyticsSince, buildAnalytics, DEFAULT_SLE_DAYS, isAssigneeFilter, parseAnalyticsDays, type AnalyticsTask } from './analytics';
import type { FlowEvent } from './flow';
import type { Status } from './types';

// 2026-10-02 12:00 Алматы (UTC+5), пятница
const NOW = new Date('2026-10-02T07:00:00Z');
const at = (local: string) => new Date(`${local.replace(' ', 'T')}:00+05:00`).toISOString();
const move = (when: string, from: Status, to: Status): FlowEvent => ({ type: 'status', at: at(when), from, to });
const ann = { key: 'u:1', userId: 1, username: 'ann', name: 'Анна Ли' };
const bob = { key: 'u:2', userId: 2, username: 'bob', name: 'Боб Ким' };

let seq = 0;
function task(over: Partial<AnalyticsTask> = {}): AnalyticsTask {
  seq++;
  return {
    id: seq, number: seq, text: `Задача ${seq}`, stars: 3, deadline: '2026-10-10', assignees: [ann],
    status: 'todo', createdAt: at('2026-09-20 10:00'), doneAt: null, blocked: false, events: [], ...over,
  };
}
/** Закрытая задача: в работу взята в started, закрыта в done (местное время). */
function closed(started: string | null, done: string, over: Partial<AnalyticsTask> = {}): AnalyticsTask {
  const events = started ? [move(started, 'todo', 'in_progress'), move(done, 'in_progress', 'done')] : [move(done, 'todo', 'done')];
  return task({ status: 'done', doneAt: at(done), events, ...over });
}

describe('параметры', () => {
  it('parseAnalyticsDays: только 7, 30, 90; по умолчанию 30', () => {
    expect(parseAnalyticsDays(null)).toBe(30);
    expect(parseAnalyticsDays('7')).toBe(7);
    expect(parseAnalyticsDays('90')).toBe(90);
    expect(parseAnalyticsDays('365')).toBeNull();
    expect(parseAnalyticsDays('abc')).toBeNull();
  });
  it('isAssigneeFilter', () => {
    expect(isAssigneeFilter('u:123')).toBe(true);
    expect(isAssigneeFilter('n:ann_1')).toBe(true);
    expect(isAssigneeFilter('none')).toBe(true);
    expect(isAssigneeFilter('u:abc')).toBe(false);
    expect(isAssigneeFilter('n:a b')).toBe(false);
    expect(isAssigneeFilter('')).toBe(false);
  });
  it('analyticsSince захватывает весь прошлый период с запасом', () => {
    // период 7 дней: 2026-09-26..2026-10-02, прошлый: 2026-09-19..2026-09-25 (начало — 2026-09-18T19:00Z)
    expect(analyticsSince(7, NOW).getTime()).toBeLessThanOrEqual(new Date('2026-09-18T19:00:00Z').getTime());
  });
});

describe('пропускная способность', () => {
  it('границы периода по Алматы', () => {
    const v = buildAnalytics([
      task({ status: 'done', doneAt: '2026-10-02T06:30:00Z' }), // 11:30 2 октября — текущий
      task({ status: 'done', doneAt: '2026-09-25T18:59:00Z' }), // 23:59 25 сентября — прошлый период
      task({ status: 'done', doneAt: '2026-09-25T19:00:00Z' }), // 00:00 26 сентября — текущий
    ], 7, NOW);
    expect(v.from).toBe('2026-09-26');
    expect(v.to).toBe('2026-10-02');
    expect(v.kpi.closed).toEqual({ value: 2, prev: 1 });
  });

  it('закрытие в 23:30 по Алматы попадает в свой день', () => {
    const v = buildAnalytics([task({ status: 'done', doneAt: '2026-10-01T18:30:00Z' })], 7, NOW); // 23:30 1 октября
    expect(v.throughput.find((b) => b.start === '2026-10-01')?.closed).toBe(1);
    expect(v.cfd.points.find((p) => p.date === '2026-10-01')?.done).toBe(1);
    expect(v.cfd.points.find((p) => p.date === '2026-09-30')?.done).toBe(0);
  });

  it('звёзды и дельты', () => {
    const v = buildAnalytics([
      closed('2026-09-30 10:00', '2026-10-01 10:00', { stars: 5 }),
      closed('2026-09-30 10:00', '2026-10-01 10:00', { stars: 2 }),
      closed('2026-09-19 10:00', '2026-09-20 10:00', { stars: 1 }),
    ], 7, NOW);
    expect(v.kpi.stars).toEqual({ value: 7, prev: 1 });
    expect(v.throughput.find((b) => b.start === '2026-10-01')).toEqual({ start: '2026-10-01', end: '2026-10-01', closed: 2, stars: 7 });
  });

  it('7 дней — по дням, 30 дней — по неделям с понедельника', () => {
    expect(buildAnalytics([], 7, NOW).throughput).toHaveLength(7);
    const w = buildAnalytics([], 30, NOW).throughput;
    // период 2026-09-03 (чт) .. 2026-10-02 (пт)
    expect(w[0]).toMatchObject({ start: '2026-09-03', end: '2026-09-06' });
    expect(w[1]).toMatchObject({ start: '2026-09-07', end: '2026-09-13' });
    expect(w.at(-1)).toMatchObject({ start: '2026-09-28', end: '2026-10-02' });
    expect(w).toHaveLength(5);
  });

  it('пустая доска без деления на ноль', () => {
    const v = buildAnalytics([], 30, NOW);
    expect(v.total).toBe(0);
    expect(v.kpi.closed).toEqual({ value: 0, prev: 0 });
    expect(v.kpi.onTime).toEqual({ value: null, prev: null });
    expect(v.kpi.cycleP50).toEqual({ value: null, prev: null });
    expect(v.cfd.littleDays).toBeNull();
    expect(v.cfd.avgWip).toBe(0);
    expect(v.blocks.share).toBeNull();
    expect(v.people).toEqual([]);
  });
});

describe('время цикла и срок выполнения', () => {
  it('цикл — от первого входа в In progress до Done, срок — от создания', () => {
    const v = buildAnalytics([closed('2026-09-29 10:00', '2026-10-01 18:00', { createdAt: at('2026-09-28 10:00') })], 7, NOW);
    expect(v.cycle.items[0]).toMatchObject({ cycleDays: 3, leadDays: 4, estimated: false, doneDate: '2026-10-01' });
    expect(v.cycle.cycle).toEqual({ count: 1, p50: 3, p85: 3, p95: 3 });
    expect(v.kpi.cycleP50.value).toBe(3);
  });

  it('закрыта минуя In progress — только срок выполнения, цикл не портит', () => {
    const v = buildAnalytics([
      closed(null, '2026-10-01 10:00', { createdAt: at('2026-09-01 10:00') }),
      closed('2026-10-01 10:00', '2026-10-01 12:00'),
    ], 7, NOW);
    expect(v.cycle.withoutProgress).toBe(1);
    expect(v.cycle.cycle).toEqual({ count: 1, p50: 1, p85: 1, p95: 1 });
    expect(v.cycle.lead.count).toBe(2);
  });

  it('старая задача без журнала — оценка, без времени в работе', () => {
    const v = buildAnalytics([task({ status: 'done', createdAt: at('2026-09-28 10:00'), doneAt: at('2026-09-30 10:00') })], 7, NOW);
    expect(v.cycle.items[0]).toMatchObject({ cycleDays: null, leadDays: 3, estimated: true });
    expect(v.cycle.estimated).toBe(1);
  });

  it('медиана прошлого периода — для дельты', () => {
    const v = buildAnalytics([
      closed('2026-10-01 10:00', '2026-10-01 12:00'),
      closed('2026-09-20 10:00', '2026-09-24 10:00'),
    ], 7, NOW);
    expect(v.kpi.cycleP50).toEqual({ value: 1, prev: 5 });
  });
});

describe('WIP и возраст', () => {
  it('возраст с последнего входа в работу, порог по умолчанию при малом числе данных', () => {
    const v = buildAnalytics([
      task({ status: 'in_progress', events: [move('2026-09-25 10:00', 'todo', 'in_progress')] }),
      task({ status: 'in_progress', events: [move('2026-09-21 10:00', 'todo', 'in_progress'), move('2026-09-22 10:00', 'in_progress', 'todo'), move('2026-10-02 09:00', 'todo', 'in_progress')] }),
      task({ status: 'todo' }),
    ], 7, NOW);
    expect(v.wip.now).toBe(2);
    expect(v.wip.queue).toBe(1);
    expect(v.wip.sleFromData).toBe(false);
    expect(v.wip.sle).toBe(DEFAULT_SLE_DAYS);
    expect(v.wip.aging.map((a) => [a.ageDays, a.overSle])).toEqual([[8, true], [1, false]]);
  });

  it('порог — 85-й перцентиль цикла, когда задач достаточно', () => {
    const v = buildAnalytics([
      closed('2026-10-01 10:00', '2026-10-01 12:00'),
      closed('2026-10-01 10:00', '2026-10-01 12:00'),
      closed('2026-09-30 10:00', '2026-10-01 12:00'),
      closed('2026-09-30 10:00', '2026-10-01 12:00'),
      closed('2026-09-22 10:00', '2026-10-01 12:00'),
      task({ status: 'in_progress', events: [move('2026-09-25 10:00', 'todo', 'in_progress')] }),
    ], 7, NOW);
    expect(v.cycle.cycle.p85).toBe(10);
    expect(v.wip.sleFromData).toBe(true);
    expect(v.wip.sle).toBe(10);
    expect(v.wip.aging[0]).toMatchObject({ ageDays: 8, overSle: false });
  });

  it('в работе без журнала — возраст с создания, помечен как оценка', () => {
    const v = buildAnalytics([task({ status: 'in_progress', createdAt: at('2026-09-30 10:00') })], 7, NOW);
    expect(v.wip.aging[0]).toMatchObject({ ageDays: 3, estimated: true });
  });
});

describe('блокировки', () => {
  it('доля времени в блоке считается только внутри периода', () => {
    // окно: 26.09 00:00 .. 02.10 12:00 = 156 ч; блок 24.09 10:00 .. 27.09 10:00 — внутри окна 34 ч
    const v = buildAnalytics([
      task({ events: [{ type: 'blocked', at: at('2026-09-24 10:00') }, { type: 'unblocked', at: at('2026-09-27 10:00') }] }),
      task({ events: [{ type: 'blocked', at: at('2026-09-21 10:00') }, { type: 'unblocked', at: at('2026-09-22 10:00') }] }),
    ], 7, NOW);
    expect(v.blocks.share).toBeCloseTo(34 / (156 * 2), 6);
    expect(v.blocks.tasks).toBe(1);
    expect(v.blocks.now).toEqual([]);
  });

  it('заблокированы сейчас: с журналом — дни, без — неизвестно', () => {
    const v = buildAnalytics([
      task({ blocked: true, events: [{ type: 'blocked', at: at('2026-09-30 10:00') }] }),
      task({ blocked: true }),
    ], 7, NOW);
    expect(v.blocks.now.map((b) => b.days)).toEqual([null, 3]);
    expect(v.blocks.unknownStart).toBe(1);
    expect(v.blocks.tasks).toBe(2);
  });
});

describe('сроки', () => {
  it('в срок — по дате закрытия в Алматы, просрочка открытых — на сегодня', () => {
    const v = buildAnalytics([
      closed(null, '2026-10-01 23:30', { deadline: '2026-10-01' }), // в день дедлайна — вовремя
      closed(null, '2026-10-01 10:00', { deadline: '2026-09-30' }), // опоздание
      task({ deadline: '2026-10-01' }), // открыта и просрочена
      task({ deadline: '2026-10-02' }), // срок сегодня — ещё не просрочена
    ], 7, NOW);
    expect(v.kpi.onTime.value).toBe(50);
    expect(v.deadlines).toEqual({ closed: 2, onTime: 1, overdueOpen: 1 });
  });
});

describe('фильтр по исполнителю', () => {
  const tasks = () => [
    closed(null, '2026-10-01 10:00', { assignees: [ann], stars: 2 }),
    closed(null, '2026-10-01 10:00', { assignees: [ann, bob], stars: 4 }),
    closed(null, '2026-10-01 10:00', { assignees: [] }),
    task({ status: 'in_progress', assignees: [bob], events: [move('2026-10-01 10:00', 'todo', 'in_progress')] }),
    closed(null, '2026-08-01 10:00', { assignees: [{ key: 'u:9', userId: 9, username: null, name: 'Старый' }] }), // давно, вне выбора
  ];

  it('без фильтра: люди и варианты', () => {
    const v = buildAnalytics(tasks(), 7, NOW);
    expect(v.assignees.map((a) => a.key)).toEqual(['u:1', 'u:2', 'none']);
    expect(v.people).toEqual([
      { key: 'u:1', name: 'Анна Ли', closed: 2, stars: 6, wip: 0 },
      { key: 'u:2', name: 'Боб Ким', closed: 1, stars: 4, wip: 1 },
      { key: 'none', name: 'Без исполнителя', closed: 1, stars: 3, wip: 0 },
    ]);
    expect(v.total).toBe(5);
    const last = v.cfd.points.at(-1)!;
    expect(last.todo + last.inProgress + last.done).toBe(v.total);
  });

  it('u:<id> — только задачи человека, варианты не зависят от фильтра', () => {
    const v = buildAnalytics(tasks(), 7, NOW, 'u:2');
    expect(v.kpi.closed.value).toBe(1);
    expect(v.wip.now).toBe(1);
    expect(v.total).toBe(2);
    expect(v.people.map((p) => p.key)).toEqual(['u:2']);
    expect(v.assignees).toHaveLength(3);
  });

  it('none — только задачи без исполнителя', () => {
    const v = buildAnalytics(tasks(), 7, NOW, 'none');
    expect(v.kpi.closed.value).toBe(1);
    expect(v.wip.now).toBe(0);
  });
});
