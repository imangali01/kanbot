export interface WebApp {
  initData: string;
  initDataUnsafe: { start_param?: string; user?: { id: number } };
  colorScheme: 'light' | 'dark';
  ready(): void;
  expand(): void;
  close(): void;
  disableVerticalSwipes?: () => void;
  openTelegramLink(url: string): void;
  showConfirm(message: string, cb: (ok: boolean) => void): void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  onEvent?: (event: string, cb: () => void) => void;
  offEvent?: (event: string, cb: () => void) => void;
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  HapticFeedback?: { impactOccurred(style: 'light' | 'medium' | 'heavy'): void; notificationOccurred?: (type: 'error' | 'success' | 'warning') => void };
}

export function webApp(): WebApp | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { Telegram?: { WebApp?: WebApp } }).Telegram?.WebApp ?? null;
}

export function confirmDialog(message: string): Promise<boolean> {
  const wa = webApp();
  if (!wa) return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => wa.showConfirm(message, resolve));
}

const PAPER = { light: '#ffffff', dark: '#121316' } as const;

export function applyTheme(wa: WebApp | null): void {
  const scheme = wa?.colorScheme ?? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = scheme;
  try {
    wa?.setHeaderColor?.(PAPER[scheme]);
    wa?.setBackgroundColor?.(PAPER[scheme]);
  } catch {
    // старые клиенты Telegram не умеют красить шапку — тема всё равно применена
  }
}
