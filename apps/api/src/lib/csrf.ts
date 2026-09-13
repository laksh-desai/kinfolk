import type { FastifyInstance, FastifyRequest } from 'fastify';
import { COOKIE, baseCookie } from './cookies';
import { randomToken, safeEqual } from './crypto';
import type { Env } from './env';
import { ForbiddenError } from './errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function allowedOrigins(env: Env): Set<string> {
  return new Set([new URL(env.WEB_URL).origin, new URL(env.API_URL).origin]);
}

function submittedToken(request: FastifyRequest): string | undefined {
  const header = request.headers['x-csrf-token'];
  if (typeof header === 'string') return header;
  const body = request.body as Record<string, unknown> | undefined;
  return typeof body?._csrf === 'string' ? body._csrf : undefined;
}

/**
 * Double-submit CSRF protection plus an Origin check on every state-changing request.
 * The readable kf_csrf cookie is not a credential: it only proves same-origin script access.
 */
export function registerCsrf(app: FastifyInstance, env: Env): void {
  const origins = allowedOrigins(env);

  app.addHook('preHandler', async (request) => {
    if (SAFE_METHODS.has(request.method)) return;
    const origin = request.headers.origin;
    if (origin !== undefined && !origins.has(origin)) {
      throw new ForbiddenError('This request came from a different website and was blocked.', 'bad_origin');
    }
    const cookieToken = request.cookies[COOKIE.csrf];
    const sent = submittedToken(request);
    if (!cookieToken || !sent || !safeEqual(cookieToken, sent)) {
      throw new ForbiddenError(
        'Your page is out of date. Refresh the page and try again.',
        'csrf_failed',
      );
    }
  });

  app.addHook('onSend', async (request, reply) => {
    if (!request.cookies[COOKIE.csrf]) {
      reply.setCookie(COOKIE.csrf, randomToken(24), {
        ...baseCookie(env),
        httpOnly: false,
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
      });
    }
  });
}
