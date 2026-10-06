import { describe, expect, it } from 'vitest';
import { stemRu } from './stem';

describe('stemRu', () => {
  it('формы слова «область» дают одну основу', () => {
    const forms = ['область', 'области', 'областя', 'областей', 'областью', 'областям'];
    expect(new Set(forms.map(stemRu))).toEqual(new Set(['област']));
  });
  it('не режет слишком короткие слова и не трогает латиницу и цифры', () => {
    expect(stemRu('дом')).toBe('дом');
    expect(stemRu('парсер')).toBe('парсер');
    expect(stemRu('dag')).toBe('dag');
    expect(stemRu('2026')).toBe('2026');
  });
});
