export const TZ = 'Asia/Almaty';

const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

export function localDate(now: Date): string {
  return fmt.format(now);
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function tomorrow(now: Date): string {
  return addDays(localDate(now), 1);
}

export type DeadlineState = 'overdue' | 'today' | 'future';

export function deadlineState(deadline: string, now: Date): DeadlineState {
  const today = localDate(now);
  if (deadline < today) return 'overdue';
  if (deadline === today) return 'today';
  return 'future';
}

export function formatDateRu(date: string): string {
  const [y, m, d] = date.split('-');
  return `${d}.${m}.${y}`;
}
