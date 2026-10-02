export const CODE_TTL_MS = 5 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const LOCK_MS = 15 * 60 * 1000;

export interface CodeState { codeHash: string; expiresAt: number; attempts: number; lockedUntil: number | null }
export type VerifyResult = 'ok' | 'wrong' | 'expired' | 'locked' | 'no_code';

function isLocked(state: CodeState | null, now: number): boolean {
  return !!state?.lockedUntil && now < state.lockedUntil;
}

export function canIssue(state: CodeState | null, now: number): boolean {
  return !isLocked(state, now);
}

export function issue(codeHash: string, now: number): CodeState {
  return { codeHash, expiresAt: now + CODE_TTL_MS, attempts: 0, lockedUntil: null };
}

export function verify(state: CodeState | null, candidateHash: string, now: number): { result: VerifyResult; next: CodeState | null } {
  if (!state) return { result: 'no_code', next: null };
  if (isLocked(state, now)) return { result: 'locked', next: state };
  if (!state.codeHash || now > state.expiresAt) return { result: 'expired', next: null };
  if (candidateHash === state.codeHash) return { result: 'ok', next: null };
  const attempts = state.attempts + 1;
  if (attempts >= MAX_ATTEMPTS) {
    return { result: 'locked', next: { codeHash: '', expiresAt: 0, attempts, lockedUntil: now + LOCK_MS } };
  }
  return { result: 'wrong', next: { ...state, attempts } };
}
