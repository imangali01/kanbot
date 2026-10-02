import { createHmac, randomBytes, randomInt } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { getDb } from '@/db/client';
import { adminLoginCodes, adminSessions } from '@/db/schema';
import { canIssue, issue, verify, type CodeState, type VerifyResult } from '@/domain/loginThrottle';
import { env } from '@/env';
import { loginCodeText } from '@/telegram/messages';
import { sendDm } from '@/telegram/notifier';
import { AccessError } from './errors';
import { findUserByUsername } from './users';

export const ADMIN_COOKIE = 'kanbot_admin';
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

const hmac = (value: string) => createHmac('sha256', env.sessionSecret).update(value).digest('hex');
const normalize = (raw: string) => raw.trim().replace(/^@/, '').toLowerCase();

type CodeRow = typeof adminLoginCodes.$inferSelect;
const toState = (r: CodeRow): CodeState => ({
  codeHash: r.codeHash,
  expiresAt: r.expiresAt.getTime(),
  attempts: r.attempts,
  lockedUntil: r.lockedUntil?.getTime() ?? null,
});

async function loadState(username: string): Promise<CodeState | null> {
  const [row] = await getDb().select().from(adminLoginCodes).where(eq(adminLoginCodes.username, username));
  return row ? toState(row) : null;
}

async function saveState(username: string, state: CodeState | null): Promise<void> {
  const db = getDb();
  if (!state) {
    await db.delete(adminLoginCodes).where(eq(adminLoginCodes.username, username));
    return;
  }
  const values = {
    codeHash: state.codeHash,
    expiresAt: new Date(state.expiresAt),
    attempts: state.attempts,
    lockedUntil: state.lockedUntil ? new Date(state.lockedUntil) : null,
  };
  await db.insert(adminLoginCodes).values({ username, ...values }).onConflictDoUpdate({ target: adminLoginCodes.username, set: values });
}

export async function requestLoginCode(raw: string): Promise<void> {
  const username = normalize(raw);
  if (!/^[a-z0-9_]{3,64}$/.test(username)) return;
  const user = await findUserByUsername(username);
  if (!user || !user.startedBot || !env.superadminIds.includes(user.id)) return;
  const now = Date.now();
  if (!canIssue(await loadState(username), now)) return;
  const code = String(randomInt(0, 10000)).padStart(4, '0');
  await saveState(username, issue(hmac(`${username}:${code}`), now));
  await sendDm(user.id, loginCodeText(code));
}

export async function verifyLoginCode(
  raw: string,
  code: string,
): Promise<{ ok: true; token: string } | { ok: false; result: Exclude<VerifyResult, 'ok'> }> {
  const username = normalize(raw);
  const out = verify(await loadState(username), hmac(`${username}:${code.trim()}`), Date.now());
  await saveState(username, out.next);
  if (out.result !== 'ok') return { ok: false, result: out.result };

  const user = await findUserByUsername(username);
  if (!user || !env.superadminIds.includes(user.id)) return { ok: false, result: 'no_code' };
  const token = randomBytes(32).toString('base64url');
  await getDb().insert(adminSessions).values({ tokenHash: hmac(token), userId: user.id, expiresAt: new Date(Date.now() + SESSION_MS) });
  return { ok: true, token };
}

export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(ADMIN_COOKIE, token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: SESSION_MS / 1000 });
}

export async function requireAdmin(): Promise<number> {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!token) throw new AccessError(401, 'Требуется вход');
  const [session] = await getDb().select().from(adminSessions).where(eq(adminSessions.tokenHash, hmac(token)));
  if (!session || session.expiresAt.getTime() < Date.now() || !env.superadminIds.includes(session.userId)) {
    throw new AccessError(401, 'Требуется вход');
  }
  return session.userId;
}

export async function logout(): Promise<void> {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  if (token) await getDb().delete(adminSessions).where(eq(adminSessions.tokenHash, hmac(token)));
  store.delete(ADMIN_COOKIE);
}
