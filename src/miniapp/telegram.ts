export interface WebApp {
  initData: string;
  initDataUnsafe: { start_param?: string; user?: { id: number } };
  ready(): void;
  expand(): void;
  close(): void;
  disableVerticalSwipes?: () => void;
  openTelegramLink(url: string): void;
  showConfirm(message: string, cb: (ok: boolean) => void): void;
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  HapticFeedback?: { impactOccurred(style: 'light' | 'medium' | 'heavy'): void };
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
