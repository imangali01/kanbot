import { ZodError } from 'zod';
import { env } from '@/env';
import { verifyInitData, type TgWebAppUser } from '@/telegram/initData';
import { AccessError } from './errors';
import { upsertUser } from './users';

export async function handle(fn: () => Promise<unknown>): Promise<Response> {
  try {
    return Response.json(await fn());
  } catch (e) {
    if (e instanceof AccessError) return Response.json({ error: e.message }, { status: e.status });
    if (e instanceof ZodError) return Response.json({ error: 'Некорректные данные' }, { status: 400 });
    console.error(e);
    return Response.json({ error: 'Внутренняя ошибка' }, { status: 500 });
  }
}

export async function requireTgUser(req: Request): Promise<TgWebAppUser> {
  const header = req.headers.get('authorization') ?? '';
  if (!header.startsWith('tma ')) throw new AccessError(401, 'Откройте доску заново из Telegram');
  const result = verifyInitData(header.slice(4), env.botToken, Math.floor(Date.now() / 1000));
  if (!result) throw new AccessError(401, 'Откройте доску заново из Telegram');
  await upsertUser(result.user);
  return result.user;
}

export function toId(raw: string): number {
  const n = Number(raw);
  if (!Number.isSafeInteger(n)) throw new AccessError(404, 'Не найдено');
  return n;
}

export type Params<K extends string> = { params: Promise<Record<K, string>> };
