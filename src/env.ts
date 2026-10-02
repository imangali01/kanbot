function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

export function parseIdList(raw: string | undefined): number[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isSafeInteger(n));
}

export const env = {
  get botToken() { return required('TELEGRAM_BOT_TOKEN'); },
  get botUsername() { return required('TELEGRAM_BOT_USERNAME'); },
  get webhookSecret() { return required('TELEGRAM_WEBHOOK_SECRET'); },
  get miniAppShortName() { return process.env.TELEGRAM_MINIAPP_SHORT_NAME ?? ''; },
  get databaseUrl() { return required('DATABASE_URL'); },
  get superadminIds() { return parseIdList(process.env.SUPERADMIN_IDS); },
  get cronSecret() { return required('CRON_SECRET'); },
  get sessionSecret() { return required('SESSION_SECRET'); },
};
