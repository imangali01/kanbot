import type { Status } from './types';

export interface DigestTask { id: number; number: number; text: string; chatTitle: string; deadline: string; status: Status; assigneeIds: number[] }
export interface Digest { today: DigestTask[]; overdue: DigestTask[] }

export function buildDigests(tasks: DigestTask[], today: string): Map<number, Digest> {
  const result = new Map<number, Digest>();
  for (const task of tasks) {
    if (task.status === 'done' || task.deadline > today) continue;
    for (const userId of task.assigneeIds) {
      const digest = result.get(userId) ?? { today: [], overdue: [] };
      (task.deadline === today ? digest.today : digest.overdue).push(task);
      result.set(userId, digest);
    }
  }
  return result;
}
