import { describe, expect, it } from 'vitest';
import { ticketId } from './ticketId';

describe('ticketId', () => {
  it('pads the number to four digits with the SD- prefix', () => {
    expect(ticketId(1)).toBe('SD-0001');
    expect(ticketId(12)).toBe('SD-0012');
    expect(ticketId(345)).toBe('SD-0345');
    expect(ticketId(9999)).toBe('SD-9999');
  });
  it('does not truncate numbers above 9999', () => {
    expect(ticketId(10000)).toBe('SD-10000');
  });
});
