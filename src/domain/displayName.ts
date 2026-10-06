export const DISPLAY_NAME_MAX = 40;

/** Пустая строка сбрасывает ручное имя (null) — вернётся имя из Telegram. */
export function normalizeDisplayName(raw: string): string | null {
  const name = raw.replace(/\s+/g, ' ').trim();
  return name ? Array.from(name).slice(0, DISPLAY_NAME_MAX).join('') : null;
}
