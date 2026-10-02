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

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

export function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

export function daysUntil(deadline: string, now: Date): number {
  return dayNumber(deadline) - dayNumber(localDate(now));
}

export function deadlineLabel(deadline: string, now: Date): string {
  const diff = daysUntil(deadline, now);
  if (diff < 0) return `просрочено ${-diff} дн.`;
  if (diff === 0) return 'сегодня';
  if (diff === 1) return 'завтра';
  const [y, m, d] = deadline.split('-').map(Number);
  const short = `${d} ${MONTHS[m - 1]}`;
  return y === Number(localDate(now).slice(0, 4)) ? short : `${short} ${y}`;
}
