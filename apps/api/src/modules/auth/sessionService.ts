import type { User } from '@prisma/client';
import type { UserDto } from '@kinfolk/shared/schemas/auth';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { COOKIE, clearSessionCookies, setSessionCookies } from '../../lib/cookies';
import { deriveKey, randomToken, safeEqual, sha256, signToken, verifyToken } from '../../lib/crypto';
import type { AppDeps } from '../../lib/deps';
import { UnauthorizedError } from '../../lib/errors';

const ROTATION_GRACE_MS = 30_000;

interface AccessPayload {
  sub: string;
  sid: string;
  exp: number;
}

export interface AuthContext {
  user: User;
  sessionId: string;
}

export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatarUrl,
    hasPassword: user.passwordHash !== null,
    createdAt: user.createdAt.toISOString(),
  };
}

function accessKey(deps: AppDeps): Buffer {
  return deriveKey(deps.env.SESSION_SECRET, 'access-token');
}

function mintAccessToken(deps: AppDeps, userId: string, sessionId: string): string {
  return signToken<AccessPayload>(accessKey(deps), {
    sub: userId,
    sid: sessionId,
    exp: deps.now().getTime() + deps.env.ACCESS_TOKEN_TTL,
  });
}

/** The single place a signed-in session is created — password, reset, Google, and dev sign-in all call this. */
export async function issueSession(deps: AppDeps, reply: FastifyReply, userId: string): Promise<void> {
  const sessionId = randomUUID();
  const secret = randomToken(32);
  const now = deps.now();
  await deps.prisma.session.create({
    data: {
      id: sessionId,
      userId,
      refreshTokenHash: sha256(secret),
      expiresAt: new Date(now.getTime() + deps.env.REFRESH_TOKEN_TTL),
      lastUsedAt: now,
    },
  });
  setSessionCookies(reply, deps.env, {
    access: mintAccessToken(deps, userId, sessionId),
    refresh: `${sessionId}.${secret}`,
  });
}

/** Rotates the refresh token. Reuse of a rotated-out token (outside the grace window) revokes the session. */
export async function refreshSession(deps: AppDeps, request: FastifyRequest, reply: FastifyReply): Promise<User> {
  const fail = (): never => {
    clearSessionCookies(reply, deps.env);
    throw new UnauthorizedError();
  };
  const raw = request.cookies[COOKIE.refresh];
  if (!raw) return fail();
  const [sessionId, secret] = raw.split('.');
  if (!sessionId || !secret || !/^[0-9a-f-]{36}$/.test(sessionId)) return fail();

  const session = await deps.prisma.session.findUnique({ where: { id: sessionId }, include: { user: true } });
  const now = deps.now();
  if (!session || session.revokedAt || session.expiresAt <= now) return fail();
  // Narrowed above; TypeScript loses it across the closure.
  const live = session;

  const presented = sha256(secret);
  if (safeEqual(presented, live.refreshTokenHash)) {
    const nextSecret = randomToken(32);
    const updated = await deps.prisma.session.updateMany({
      where: { id: live.id, refreshTokenHash: live.refreshTokenHash },
      data: {
        refreshTokenHash: sha256(nextSecret),
        previousTokenHash: live.refreshTokenHash,
        rotatedAt: now,
        lastUsedAt: now,
      },
    });
    if (updated.count === 1) {
      setSessionCookies(reply, deps.env, {
        access: mintAccessToken(deps, live.userId, live.id),
        refresh: `${live.id}.${nextSecret}`,
      });
      return live.user;
    }
    // Lost a race with a concurrent refresh: that response already carries the new refresh
    // cookie, so hand back only a fresh access token.
    setSessionCookies(reply, deps.env, { access: mintAccessToken(deps, live.userId, live.id) });
    return live.user;
  }

  const withinGrace =
    live.previousTokenHash !== null &&
    safeEqual(presented, live.previousTokenHash) &&
    live.rotatedAt !== null &&
    now.getTime() - live.rotatedAt.getTime() < ROTATION_GRACE_MS;
  if (withinGrace) {
    setSessionCookies(reply, deps.env, { access: mintAccessToken(deps, live.userId, live.id) });
    return live.user;
  }

  await deps.prisma.session.update({ where: { id: live.id }, data: { revokedAt: now } });
  return fail();
}

/** Resolves the caller from the access cookie, or null. Checks the session row so sign-out is immediate. */
export async function readAuth(deps: AppDeps, request: FastifyRequest): Promise<AuthContext | null> {
  const token = request.cookies[COOKIE.access];
  if (!token) return null;
  const payload = verifyToken<AccessPayload>(accessKey(deps), token, deps.now().getTime());
  if (!payload) return null;
  const session = await deps.prisma.session.findUnique({ where: { id: payload.sid }, include: { user: true } });
  if (!session || session.revokedAt || session.userId !== payload.sub || session.expiresAt <= deps.now()) {
    return null;
  }
  return { user: session.user, sessionId: session.id };
}

export async function endSession(deps: AppDeps, request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const auth = await readAuth(deps, request);
  const raw = request.cookies[COOKIE.refresh];
  const sessionId = auth?.sessionId ?? raw?.split('.')[0];
  if (sessionId && /^[0-9a-f-]{36}$/.test(sessionId)) {
    await deps.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: deps.now() },
    });
  }
  clearSessionCookies(reply, deps.env);
}

export async function revokeAllSessions(deps: AppDeps, userId: string): Promise<void> {
  await deps.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: deps.now() } });
}
