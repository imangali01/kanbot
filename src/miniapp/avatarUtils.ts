export const AVATAR_HUES = [12, 38, 84, 150, 176, 205, 238, 280, 326];

export function avatarHue(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return AVATAR_HUES[h % AVATAR_HUES.length];
}

export function initials(name: string): string {
  const parts = name.replace(/^@/, '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts.slice(0, 2).map((p) => Array.from(p)[0].toUpperCase()).join('');
}
