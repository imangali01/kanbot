import { describe, expect, it } from 'vitest';
import { buildDigests, type DigestTask } from './digest';

const t = (p: Partial<DigestTask>): DigestTask => ({ id: 1, number: 1, text: 'x', chatId: -1, chatTitle: 'test', deadline: '2026-10-02', status: 'todo', assigneeIds: [], ...p });

describe('buildDigests', () => {
  it('groups today and overdue per assignee, skips done and future', () => {
    const tasks = [
      t({ id: 1, deadline: '2026-10-02', assigneeIds: [10, 20] }),
      t({ id: 2, deadline: '2026-09-30', assigneeIds: [10] }),
      t({ id: 3, deadline: '2026-10-05', assigneeIds: [10] }),
      t({ id: 4, deadline: '2026-10-01', status: 'done', assigneeIds: [10] }),
    ];
    const d = buildDigests(tasks, '2026-10-02');
    expect([...d.keys()].sort()).toEqual([10, 20]);
    expect(d.get(10)!.today.map((x) => x.id)).toEqual([1]);
    expect(d.get(10)!.overdue.map((x) => x.id)).toEqual([2]);
    expect(d.get(20)!.overdue).toEqual([]);
  });
});
