import type { Update } from 'grammy/types';
import { env } from '@/env';
import { handleUpdate } from '@/server/bot';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  if (req.headers.get('x-telegram-bot-api-secret-token') !== env.webhookSecret) {
    return new Response('forbidden', { status: 403 });
  }
  const update = (await req.json()) as Update;
  try {
    await handleUpdate(update);
  } catch (e) {
    console.error('update failed', update.update_id, e);
  }
  return new Response('ok');
}
