import { env } from '@/env';
import { sendDailyDigests } from '@/server/digest';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  if (req.headers.get('authorization') !== `Bearer ${env.cronSecret}`) return new Response('forbidden', { status: 403 });
  return Response.json({ sent: await sendDailyDigests(new Date()) });
}
