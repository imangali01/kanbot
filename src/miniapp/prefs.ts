import type { SortMode } from '@/domain/types';

export interface BoardPrefs { sort: SortMode; assigneeKey: string | null; showAll: boolean }

const DEFAULT: BoardPrefs = { sort: 'manual', assigneeKey: null, showAll: false };
const key = (chatId: number) => `kanbot:prefs:${chatId}`;

export function loadPrefs(chatId: number): BoardPrefs {
  try {
    const raw = localStorage.getItem(key(chatId));
    return raw ? { ...DEFAULT, ...(JSON.parse(raw) as Partial<BoardPrefs>) } : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function savePrefs(chatId: number, prefs: BoardPrefs): void {
  try {
    localStorage.setItem(key(chatId), JSON.stringify(prefs));
  } catch {
    // хранилище недоступно — настройки просто не запомнятся
  }
}
