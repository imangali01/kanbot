import { describe, expect, it } from 'vitest';
import {
  buildBlocks, buildCfd, buildTimeline, cfdSignals, firstEntry, lastEntry, percentile, spanDays, startOfLocalDay, statusAt, timeStats,
  type FlowEvent, type FlowTaskInput,
} from './flow';
import type { CfdPoint } from './types';

/** Местное время Алматы (UTC+5) → ISO. */
const at = (local: string) => new Date(`${local.replace(' ', 'T')}:00+05:00`).toISOString();
const ms = (local: string) => Date.parse(at(local));
const move = (when: string, from: FlowTaskInput['status'], to: FlowTaskInput['status']): FlowEvent => ({ type: 'status', at: at(when), from, to });

function task(over: Partial<FlowTaskInput> = {}): FlowTaskInput {
  return { status: 'todo', createdAt: at('2026-09-28 10:00'), doneAt: null, blocked: false, events: [], ...over };
}

describe('buildTimeline', () => {
  it('по журналу: Todo → In progress → Done', () => {
    const tl = buildTimeline(task({
      status: 'done',
      doneAt: at('2026-09-30 10:00'),
      events: [move('2026-09-29 10:00', 'todo', 'in_progress'), move('2026-09-30 10:00', 'in_progress', 'done')],
    }));
    expect(tl.estimated).toBe(false);
    expect(tl.segments.map((s) => s.status)).toEqual(['todo', 'in_progress', 'done']);
    expect(firstEntry(tl, 'in_progress')?.start).toBe(ms('2026-09-29 10:00'));
    expect(tl.segments[2].end).toBeNull();
  });

  it('события сортируются по времени', () => {
    const tl = buildTimeline(task({
      status: 'done',
      doneAt: at('2026-09-30 10:00'),
      events: [move('2026-09-30 10:00', 'in_progress', 'done'), move('2026-09-29 10:00', 'todo', 'in_progress')],
    }));
    expect(tl.segments.map((s) => s.status)).toEqual(['todo', 'in_progress', 'done']);
  });

  it('Done без журнала: Todo до doneAt, затем Done, без времени в работе, помечено как оценка', () => {
    const tl = buildTimeline(task({ status: 'done', doneAt: at('2026-09-30 10:00') }));
    expect(tl.estimated).toBe(true);
    expect(tl.segments.map((s) => [s.status, s.start])).toEqual([['todo', ms('2026-09-28 10:00')], ['done', ms('2026-09-30 10:00')]]);
    expect(firstEntry(tl, 'in_progress')).toBeNull();
  });

  it('повторные входы в In progress: первый — для цикла, последний — для возраста', () => {
    const tl = buildTimeline(task({
      status: 'in_progress',
      events: [
        move('2026-09-28 12:00', 'todo', 'in_progress'),
        move('2026-09-29 12:00', 'in_progress', 'todo'),
        move('2026-10-01 12:00', 'todo', 'in_progress'),
      ],
    }));
    expect(firstEntry(tl, 'in_progress')?.start).toBe(ms('2026-09-28 12:00'));
    expect(lastEntry(tl, 'in_progress')?.start).toBe(ms('2026-10-01 12:00'));
    expect(tl.estimated).toBe(false);
  });

  it('возврат из Done', () => {
    const tl = buildTimeline(task({
      status: 'in_progress',
      events: [move('2026-09-28 12:00', 'todo', 'in_progress'), move('2026-09-29 12:00', 'in_progress', 'done'), move('2026-09-30 12:00', 'done', 'in_progress')],
    }));
    expect(statusAt(tl, ms('2026-09-29 18:00'))).toBe('done');
    expect(statusAt(tl, ms('2026-10-01 18:00'))).toBe('in_progress');
    expect(statusAt(tl, ms('2026-09-27 18:00'))).toBeNull();
  });

  it('In progress без журнала: вход в работу — оценка с момента создания', () => {
    const tl = buildTimeline(task({ status: 'in_progress' }));
    expect(tl.estimated).toBe(true);
    const since = lastEntry(tl, 'in_progress')!;
    expect(since.assumed).toBe(true);
    expect(since.start).toBe(ms('2026-09-28 10:00'));
  });

  it('журнал начат, когда задача уже была в работе', () => {
    const tl = buildTimeline(task({ status: 'done', doneAt: at('2026-09-30 10:00'), events: [move('2026-09-30 10:00', 'in_progress', 'done')] }));
    expect(tl.estimated).toBe(true);
    expect(firstEntry(tl, 'in_progress')?.assumed).toBe(true);
  });
});

describe('percentile (nearest-rank)', () => {
  it('пустая выборка', () => {
    expect(percentile([], 50)).toBeNull();
    expect(timeStats([])).toEqual({ count: 0, p50: null, p85: null, p95: null });
  });
  it('одно значение', () => {
    expect(timeStats([4])).toEqual({ count: 1, p50: 4, p85: 4, p95: 4 });
  });
  it('два значения', () => {
    expect(timeStats([9, 1])).toEqual({ count: 2, p50: 1, p85: 9, p95: 9 });
  });
  it('десять значений', () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(xs, 50)).toBe(5);
    expect(percentile(xs, 85)).toBe(9);
    expect(percentile(xs, 95)).toBe(10);
  });
});

describe('даты по Алматы', () => {
  it('spanDays считает оба края', () => {
    expect(spanDays(ms('2026-10-01 09:00'), ms('2026-10-01 18:00'))).toBe(1);
    expect(spanDays(ms('2026-10-01 23:30'), ms('2026-10-02 00:10'))).toBe(2);
  });
  it('startOfLocalDay', () => {
    expect(startOfLocalDay('2026-10-02')).toBe(Date.parse('2026-10-01T19:00:00Z'));
  });
});

describe('buildCfd', () => {
  const tasks = [
    task({ status: 'done', doneAt: at('2026-09-30 10:00'), events: [move('2026-09-29 10:00', 'todo', 'in_progress'), move('2026-09-30 10:00', 'in_progress', 'done')] }),
    task({ createdAt: at('2026-09-29 09:00'), status: 'in_progress', events: [move('2026-10-01 10:00', 'todo', 'in_progress')] }),
    // закрыта в 23:30 по Алматы — 30 сентября, хотя по UTC тоже 30-е
    task({ status: 'done', doneAt: at('2026-09-30 23:30'), events: [move('2026-09-28 11:00', 'todo', 'in_progress'), move('2026-09-30 23:30', 'in_progress', 'done')] }),
    // закрыта в 00:30 1 октября по Алматы, по UTC это ещё 30 сентября
    task({ status: 'done', doneAt: at('2026-10-01 00:30'), events: [move('2026-09-28 11:00', 'todo', 'in_progress'), move('2026-10-01 00:30', 'in_progress', 'done')] }),
  ];
  const points = buildCfd(tasks.map(buildTimeline), '2026-09-27', '2026-10-02');

  it('по дням на конец дня', () => {
    expect(points.map((p) => [p.date, p.todo, p.inProgress, p.done])).toEqual([
      ['2026-09-27', 0, 0, 0],
      ['2026-09-28', 1, 2, 0],
      ['2026-09-29', 1, 3, 0],
      ['2026-09-30', 1, 1, 2],
      ['2026-10-01', 0, 1, 3],
      ['2026-10-02', 0, 1, 3],
    ]);
  });

  it('сумма слоёв = число уже созданных задач, Done без возвратов не убывает', () => {
    const created = [0, 3, 4, 4, 4, 4];
    points.forEach((p, i) => expect(p.todo + p.inProgress + p.done).toBe(created[i]));
    points.forEach((p, i) => i > 0 && expect(p.done).toBeGreaterThanOrEqual(points[i - 1].done));
  });

  it('возврат из Done уменьшает слой Done', () => {
    const back = task({ status: 'in_progress', events: [move('2026-09-28 12:00', 'todo', 'done'), move('2026-09-30 12:00', 'done', 'in_progress')] });
    const p = buildCfd([buildTimeline(back)], '2026-09-28', '2026-09-30');
    expect(p.map((x) => x.done)).toEqual([1, 1, 0]);
    expect(cfdSignals([...p, ...p])).toContain('doneDrops');
  });
});

describe('cfdSignals', () => {
  const pt = (todo: number, inProgress: number, done: number): CfdPoint => ({ date: '2026-10-01', todo, inProgress, done });
  it('мало точек — без выводов', () => {
    expect(cfdSignals([pt(1, 1, 1), pt(1, 1, 2)])).toEqual([]);
  });
  it('ровный поток', () => {
    expect(cfdSignals([pt(3, 2, 0), pt(3, 2, 1), pt(3, 2, 2), pt(3, 2, 3), pt(3, 2, 4), pt(3, 2, 5), pt(3, 2, 6), pt(3, 2, 7)])).toEqual(['steady']);
  });
  it('WIP растёт, Done стоит', () => {
    const s = cfdSignals([pt(5, 1, 3), pt(4, 2, 3), pt(3, 3, 3), pt(2, 4, 3), pt(1, 5, 3), pt(0, 6, 3), pt(0, 6, 3), pt(0, 6, 3)]);
    expect(s).toContain('wipGrowing');
    expect(s).toContain('doneFlat');
    expect(s).toContain('queueShrinking');
  });
});

describe('buildBlocks', () => {
  it('пара blocked/unblocked', () => {
    expect(buildBlocks(task({ events: [{ type: 'blocked', at: at('2026-09-29 10:00') }, { type: 'unblocked', at: at('2026-09-30 10:00') }] })))
      .toEqual([{ start: ms('2026-09-29 10:00'), end: ms('2026-09-30 10:00') }]);
  });
  it('блок не снят', () => {
    expect(buildBlocks(task({ blocked: true, events: [{ type: 'blocked', at: at('2026-09-29 10:00') }] })))
      .toEqual([{ start: ms('2026-09-29 10:00'), end: null }]);
  });
  it('повторная блокировка не сдвигает начало', () => {
    expect(buildBlocks(task({ blocked: true, events: [{ type: 'blocked', at: at('2026-09-29 10:00') }, { type: 'blocked', at: at('2026-09-30 10:00') }] })))
      .toEqual([{ start: ms('2026-09-29 10:00'), end: null }]);
  });
  it('начало неизвестно: блок до журнала', () => {
    expect(buildBlocks(task({ blocked: true }))).toEqual([{ start: null, end: null }]);
    expect(buildBlocks(task({ events: [{ type: 'unblocked', at: at('2026-09-30 10:00') }] }))).toEqual([{ start: null, end: ms('2026-09-30 10:00') }]);
  });
});
