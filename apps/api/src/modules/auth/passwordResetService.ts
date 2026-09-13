import type { FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID, createHmac } from 'node:crypto';
import { COOKIE, baseCookie } from '../../lib/cookies';
import { deriveKey, hashPassword, randomOtp, safeEqual, signToken, verifyToken } from '../../lib/crypto';
import type { AppDeps } from '../../lib/deps';
import { ValidationError } from '../../lib/errors';
import { issueSession, revokeAllSessions } from './sessionService';

const CODE_TTL_MS = 15 * 60_000;
const VERIFIED_TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;

interface ResetFlow {
  rid: string;
  stage: 'pending' | 'verified';
  exp: number;
}

export type ResetStage = 'none' | 'pending' | 'verified';

const WRONG_CODE = "That code isn't right, or it has expired. Check the email or request a new code.";

function flowKey(deps: AppDeps): Buffer {
  return deriveKey(deps.env.SESSION_SECRET, 'password-reset-flow');
}

function codeHash(deps: AppDeps, resetId: string, code: string): string {
  return createHmac('sha256', deriveKey(deps.env.SESSION_SECRET, 'password-reset-code'))
    .update(`${resetId}:${code}`)
    .digest('base64url');
}

function setFlowCookie(deps: AppDeps, reply: FastifyReply, flow: ResetFlow): void {
  reply.setCookie(COOKIE.reset, signToken(flowKey(deps), flow), {
    ...baseCookie(deps.env),
    sameSite: 'strict',
    path: '/api/auth/password',
    maxAge: Math.floor((flow.exp - deps.now().getTime()) / 1000),
  });
}

function readFlow(deps: AppDeps, request: FastifyRequest): ResetFlow | null {
  const raw = request.cookies[COOKIE.reset];
  return raw ? verifyToken<ResetFlow>(flowKey(deps), raw, deps.now().getTime()) : null;
}

export function resetStage(deps: AppDeps, request: FastifyRequest): ResetStage {
  return readFlow(deps, request)?.stage ?? 'none';
}

/**
 * Always behaves identically whether or not the email has an account, so the endpoint can't
 * be used to discover who uses Kinfolk.
 */
export async function requestPasswordReset(
  deps: AppDeps,
  reply: FastifyReply,
  email: string,
): Promise<void> {
  const resetId = randomUUID();
  const now = deps.now();
  const user = await deps.prisma.user.findUnique({ where: { email } });
  if (user) {
    const code = randomOtp();
    await deps.prisma.$transaction([
      deps.prisma.passwordReset.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: now },
      }),
      deps.prisma.passwordReset.create({
        data: {
          id: resetId,
          userId: user.id,
          codeHash: codeHash(deps, resetId, code),
          expiresAt: new Date(now.getTime() + CODE_TTL_MS),
        },
      }),
    ]);
    await deps.mailer.send({
      to: user.email,
      subject: `Your Kinfolk password reset code: ${code}`,
      text: [
        `Hello ${user.firstName},`,
        '',
        `Your code to reset your Kinfolk password is ${code}.`,
        'It expires in 15 minutes. If you did not ask for this, you can ignore this email —',
        'your password has not changed.',
      ].join('\n'),
    });
  }
  setFlowCookie(deps, reply, { rid: resetId, stage: 'pending', exp: now.getTime() + CODE_TTL_MS });
}

export async function verifyResetCode(
  deps: AppDeps,
  request: FastifyRequest,
  reply: FastifyReply,
  code: string,
): Promise<void> {
  const flow = readFlow(deps, request);
  if (!flow) {
    throw new ValidationError('This reset request has expired. Start again to get a new code.', {
      code: 'This reset request has expired. Start again to get a new code.',
    });
  }
  const reset = await deps.prisma.passwordReset.findUnique({ where: { id: flow.rid } });
  const now = deps.now();
  if (!reset || reset.consumedAt || reset.expiresAt <= now) {
    throw new ValidationError(WRONG_CODE, { code: WRONG_CODE });
  }
  if (reset.attempts >= MAX_ATTEMPTS) {
    const message = 'Too many incorrect codes. Start again to get a new code.';
    throw new ValidationError(message, { code: message });
  }
  if (!safeEqual(codeHash(deps, reset.id, code), reset.codeHash)) {
    await deps.prisma.passwordReset.update({ where: { id: reset.id }, data: { attempts: { increment: 1 } } });
    throw new ValidationError(WRONG_CODE, { code: WRONG_CODE });
  }
  await deps.prisma.passwordReset.update({ where: { id: reset.id }, data: { verifiedAt: now } });
  setFlowCookie(deps, reply, { rid: reset.id, stage: 'verified', exp: now.getTime() + VERIFIED_TTL_MS });
}

export async function completePasswordReset(
  deps: AppDeps,
  request: FastifyRequest,
  reply: FastifyReply,
  password: string,
): Promise<void> {
  const flow = readFlow(deps, request);
  const expired = 'This reset link has expired. Start again to get a new code.';
  if (!flow || flow.stage !== 'verified') throw new ValidationError(expired, { password: expired });
  const reset = await deps.prisma.passwordReset.findUnique({ where: { id: flow.rid } });
  if (!reset || reset.consumedAt || !reset.verifiedAt) throw new ValidationError(expired, { password: expired });

  const now = deps.now();
  await deps.prisma.$transaction([
    deps.prisma.user.update({ where: { id: reset.userId }, data: { passwordHash: await hashPassword(password) } }),
    deps.prisma.passwordReset.update({ where: { id: reset.id }, data: { consumedAt: now } }),
  ]);
  await revokeAllSessions(deps, reset.userId);
  reply.clearCookie(COOKIE.reset, { ...baseCookie(deps.env), sameSite: 'strict', path: '/api/auth/password' });
  await issueSession(deps, reply, reset.userId);
}
