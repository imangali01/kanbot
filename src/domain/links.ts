export function buildStartParam(chatId: number, taskNumber?: number): string {
  return taskNumber ? `c${chatId}_t${taskNumber}` : `c${chatId}`;
}

export function parseStartParam(p: string | null | undefined): { chatId: number; taskNumber: number | null } | null {
  const m = /^c(-?\d+)(?:_t(\d+))?$/.exec(p ?? '');
  if (!m) return null;
  return { chatId: Number(m[1]), taskNumber: m[2] ? Number(m[2]) : null };
}

export function miniAppLink(botUsername: string, shortName: string, startParam: string): string {
  return `https://t.me/${botUsername}/${shortName}?startapp=${encodeURIComponent(startParam)}`;
}

export function supergroupMessageLink(chatId: number, messageId: number): string | null {
  const s = String(chatId);
  if (!s.startsWith('-100')) return null;
  return `https://t.me/c/${s.slice(4)}/${messageId}`;
}
