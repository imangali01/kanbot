/** Имя команды в начале сообщения: `/help`, `/help@наш_бот`. Чужому боту и тексту без `/` — null. */
export function commandName(text: string | undefined, botUsername: string): string | null {
  const m = /^\/([A-Za-z0-9_]+)(?:@([A-Za-z0-9_]+))?(?=\s|$)/.exec(text ?? '');
  if (!m) return null;
  if (m[2] !== undefined && m[2].toLowerCase() !== botUsername.toLowerCase()) return null;
  return m[1].toLowerCase();
}
