import { logout } from '@/server/admin';
import { handle } from '@/server/http';

export const dynamic = 'force-dynamic';

export function POST() {
  return handle(async () => {
    await logout();
    return { ok: true };
  });
}
