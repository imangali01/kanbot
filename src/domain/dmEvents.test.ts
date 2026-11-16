import { describe, expect, it } from 'vitest';
import { DM_EVENTS, DM_EVENT_KEYS, dmEnabled } from './dmEvents';

describe('dmEnabled', () => {
  it('по умолчанию (пустой список выключенных) приходят все типы', () => {
    for (const e of DM_EVENT_KEYS) expect(dmEnabled([], e)).toBe(true);
  });

  it('выключается только перечисленный тип', () => {
    expect(dmEnabled(['moved'], 'moved')).toBe(false);
    expect(dmEnabled(['moved'], 'done')).toBe(true);
  });

  it('у каждого типа есть название и пояснение для админки', () => {
    for (const e of DM_EVENTS) {
      expect(e.title.length).toBeGreaterThan(0);
      expect(e.hint.length).toBeGreaterThan(0);
    }
    expect(new Set(DM_EVENT_KEYS).size).toBe(DM_EVENTS.length);
  });
});
