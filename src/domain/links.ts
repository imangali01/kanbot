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

export interface LinkButton { text: string; url: string }

/** Кнопка Mini App: с номером задачи открывает карточку, без него — доску. */
export function miniAppButton(botUsername: string, shortName: string | undefined, chatId: number, taskNumber?: number): LinkButton | undefined {
  if (!shortName) return undefined;
  return { text: taskNumber ? 'Открыть карточку' : 'Открыть доску', url: miniAppLink(botUsername, shortName, buildStartParam(chatId, taskNumber)) };
}

/** Кнопки под личным уведомлением: карточка в Mini App и (где Telegram это позволяет) исходное сообщение в группе. */
export function taskLinkButtons(p: {
  botUsername: string;
  shortName: string | undefined;
  chatId: number;
  chatType: string;
  taskNumber: number;
  sourceMessageId: number;
}): LinkButton[] {
  const buttons: LinkButton[] = [];
  const card = miniAppButton(p.botUsername, p.shortName, p.chatId, p.taskNumber);
  if (card) buttons.push(card);
  const message = p.chatType === 'supergroup' ? supergroupMessageLink(p.chatId, p.sourceMessageId) : null;
  if (message) buttons.push({ text: 'К сообщению', url: message });
  return buttons;
}
