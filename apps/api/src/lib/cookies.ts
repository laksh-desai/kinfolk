import type { CookieSerializeOptions } from '@fastify/cookie';
import type { FastifyReply } from 'fastify';
import type { Env } from './env';

export const COOKIE = {
  access: 'kf_at',
  refresh: 'kf_rt',
  csrf: 'kf_csrf',
  reset: 'kf_reset',
  oauth: 'kf_oauth',
} as const;

export function baseCookie(env: Env): Pick<CookieSerializeOptions, 'secure' | 'httpOnly' | 'sameSite'> {
  // Browsers treat http://localhost as a secure context, but test clients over plain http do
  // not, so Secure is set whenever we are not in development or test.
  return { secure: env.NODE_ENV === 'production', httpOnly: true, sameSite: 'lax' };
}

export function setSessionCookies(
  reply: FastifyReply,
  env: Env,
  tokens: { access: string; refresh?: string },
): void {
  reply.setCookie(COOKIE.access, tokens.access, {
    ...baseCookie(env),
    path: '/api',
    maxAge: Math.floor(env.ACCESS_TOKEN_TTL / 1000),
  });
  if (tokens.refresh) {
    reply.setCookie(COOKIE.refresh, tokens.refresh, {
      ...baseCookie(env),
      sameSite: 'strict',
      path: '/api/auth',
      maxAge: Math.floor(env.REFRESH_TOKEN_TTL / 1000),
    });
  }
}

export function clearSessionCookies(reply: FastifyReply, env: Env): void {
  reply.clearCookie(COOKIE.access, { ...baseCookie(env), path: '/api' });
  reply.clearCookie(COOKIE.refresh, { ...baseCookie(env), sameSite: 'strict', path: '/api/auth' });
}
