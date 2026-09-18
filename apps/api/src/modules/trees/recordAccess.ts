import type { FastifyReply, FastifyRequest } from 'fastify';
import { COOKIE, baseCookie } from '../../lib/cookies';
import { deriveKey, safeEqual, signToken, verifyToken } from '../../lib/crypto';
import type { AppDeps } from '../../lib/deps';
import { ForbiddenError } from '../../lib/errors';

/**
 * Public records sit behind a shared passphrase as well as tree membership (ADR 037). The check
 * is here, on the server, and not in the browser: a gate the client enforces is no gate at all,
 * because the PDF has a URL and anyone signed in could fetch it directly.
 *
 * Unlocking mints a short-lived signed cookie. The passphrase itself never reaches the client
 * and is never stored — only compared, in constant time, against the configured one.
 */
const UNLOCK_TTL_MS = 30 * 60_000;

interface RecordsUnlock {
  exp: number;
}

const keyFor = (deps: Pick<AppDeps, 'env'>) => deriveKey(deps.env.SESSION_SECRET, 'records-unlock');

/** Whether this deployment asks for a passphrase at all. */
export function recordsGated(deps: Pick<AppDeps, 'env'>): boolean {
  return Boolean(deps.env.RECORDS_PASSPHRASE);
}

export function recordsUnlocked(deps: Pick<AppDeps, 'env' | 'now'>, request: FastifyRequest): boolean {
  if (!recordsGated(deps)) return true;
  const raw = request.cookies[COOKIE.records];
  return Boolean(raw && verifyToken<RecordsUnlock>(keyFor(deps), raw, deps.now().getTime()));
}

/** Compares in constant time, so a wrong answer never tells you how much of it was right. */
export function passphraseMatches(deps: Pick<AppDeps, 'env'>, attempt: string): boolean {
  const expected = deps.env.RECORDS_PASSPHRASE;
  return Boolean(expected) && safeEqual(expected as string, attempt);
}

export function grantRecordsUnlock(deps: Pick<AppDeps, 'env' | 'now'>, reply: FastifyReply): number {
  const expiresAt = deps.now().getTime() + UNLOCK_TTL_MS;
  reply.setCookie(COOKIE.records, signToken<RecordsUnlock>(keyFor(deps), { exp: expiresAt }), {
    ...baseCookie(deps.env),
    path: '/api',
    maxAge: Math.floor(UNLOCK_TTL_MS / 1000),
  });
  return expiresAt;
}

export function requireRecordsUnlock(deps: Pick<AppDeps, 'env' | 'now'>, request: FastifyRequest): void {
  if (recordsUnlocked(deps, request)) return;
  throw new ForbiddenError('Enter the passphrase for public records first.', 'records_locked');
}
