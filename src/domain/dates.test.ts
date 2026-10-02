import { describe, expect, it } from 'vitest';
import { addDays, deadlineState, formatDateRu, localDate, tomorrow } from './dates';

describe('dates (Asia/Almaty, UTC+5)', () => {
  it('local date switches at 19:00 UTC', () => {
    expect(localDate(new Date('2026-10-02T18:59:59Z'))).toBe('2026-10-02');
    expect(localDate(new Date('2026-10-02T19:00:00Z'))).toBe('2026-10-03');
  });
  it('tomorrow is based on local date', () => {
    expect(tomorrow(new Date('2026-10-02T19:30:00Z'))).toBe('2026-10-04');
    expect(tomorrow(new Date('2026-10-02T10:00:00Z'))).toBe('2026-10-03');
  });
  it('addDays crosses month and year', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('deadlineState', () => {
    const now = new Date('2026-10-02T12:00:00Z');
    expect(deadlineState('2026-10-01', now)).toBe('overdue');
    expect(deadlineState('2026-10-02', now)).toBe('today');
    expect(deadlineState('2026-10-03', now)).toBe('future');
  });
  it('formatDateRu', () => {
    expect(formatDateRu('2026-10-02')).toBe('02.10.2026');
  });
});
