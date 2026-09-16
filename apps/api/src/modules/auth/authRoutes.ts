import {
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
  verifyResetCodeSchema,
  type AuthProvidersDto,
} from '@kinfolk/shared/schemas/auth';
import type { FastifyInstance } from 'fastify';
import { COOKIE, baseCookie } from '../../lib/cookies';
import { deriveKey, randomToken, safeEqual, signToken, verifyToken } from '../../lib/crypto';
import type { AppDeps } from '../../lib/deps';
import { AppError, ForbiddenError, UnauthorizedError } from '../../lib/errors';
import { parseInput } from '../../lib/validate';
import { requireAuth } from './authenticate';
import { completeOAuthSignIn, signIn, signUp } from './authService';
import { DevOAuthProvider } from './oauth/devOAuthProvider';
import {
  completePasswordReset,
  requestPasswordReset,
  resetStage,
  verifyResetCode,
} from './passwordResetService';
import { endSession, issueSession, refreshSession, toUserDto } from './sessionService';
import { renderDevConsentPage } from './devConsentPage';

export interface AuthRateLimits {
  max: number;
  timeWindow: string;
}

interface OAuthState {
  state: string;
  returnTo: string;
  exp: number;
}

/** Only same-site relative paths; never "//evil.example" or an absolute URL. */
export function safeReturnTo(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\')
  ) {
    return '/';
  }
  return value;
}

export async function authRoutes(
  app: FastifyInstance,
  opts: { deps: AppDeps; rateLimit: AuthRateLimits },
) {
  const { deps } = opts;
  const limited = { config: { rateLimit: opts.rateLimit } };
  const oauthKey = deriveKey(deps.env.SESSION_SECRET, 'oauth-state');
  const redirectUri = `${deps.env.WEB_URL}/api/auth/oauth/google/callback`;

  app.get('/api/auth/csrf', async (_request, reply) => reply.code(204).send());

  app.get('/api/auth/providers', async (): Promise<AuthProvidersDto> => ({
    google: { mode: deps.oauth.mode },
  }));

  app.get('/api/auth/me', async (request) => ({ user: toUserDto(requireAuth(request).user) }));

  app.post('/api/auth/signup', limited, async (request, reply) => {
    const input = parseInput(signUpSchema, request.body);
    assertMayRegister(deps.env.SIGNUP_ALLOWLIST, input.email);
    const user = await signUp(deps, input);
    await issueSession(deps, reply, user.id);
    return reply.code(201).send({ user: toUserDto(user) });
  });

  app.post('/api/auth/login', limited, async (request, reply) => {
    const input = parseInput(signInSchema, request.body);
    const user = await signIn(deps, input);
    await issueSession(deps, reply, user.id);
    return { user: toUserDto(user) };
  });

  app.post('/api/auth/refresh', async (request, reply) => {
    const user = await refreshSession(deps, request, reply);
    return { user: toUserDto(user) };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    await endSession(deps, request, reply);
    return reply.code(204).send();
  });

  // --- Forgot password: email → 6-digit code → new password ---------------------------

  app.get('/api/auth/password/status', async (request) => ({ stage: resetStage(deps, request) }));

  app.post('/api/auth/password/forgot', limited, async (request, reply) => {
    const { email } = parseInput(forgotPasswordSchema, request.body);
    await requestPasswordReset(deps, reply, email);
    return reply.code(202).send({ stage: 'pending' });
  });

  app.post('/api/auth/password/verify', limited, async (request, reply) => {
    const { code } = parseInput(verifyResetCodeSchema, request.body);
    await verifyResetCode(deps, request, reply, code);
    return { stage: 'verified' };
  });

  app.post('/api/auth/password/reset', limited, async (request, reply) => {
    const { password } = parseInput(resetPasswordSchema, request.body);
    await completePasswordReset(deps, request, reply, password);
    return { stage: 'none' };
  });

  // --- Google OAuth (or its development stand-in) --------------------------------------
  // With no provider the routes are never registered, so there is nothing to probe: a deployment
  // without Google credentials has no OAuth surface at all (ADR 036).
  if (deps.oauth.mode !== 'off') {
    app.get('/api/auth/oauth/google/start', limited, async (request, reply) => {
      const query = request.query as { returnTo?: string };
      const state = randomToken(24);
      const exp = deps.now().getTime() + 10 * 60_000;
      reply.setCookie(
        COOKIE.oauth,
        signToken<OAuthState>(oauthKey, { state, returnTo: safeReturnTo(query.returnTo), exp }),
        {
          ...baseCookie(deps.env),
          path: '/api/auth/oauth',
          maxAge: 600,
        },
      );
      return reply.redirect(deps.oauth.authorizationUrl(state, redirectUri));
    });

    app.get('/api/auth/oauth/google/callback', async (request, reply) => {
      const query = request.query as { code?: string; state?: string; error?: string };
      const raw = request.cookies[COOKIE.oauth];
      const saved = raw ? verifyToken<OAuthState>(oauthKey, raw, deps.now().getTime()) : null;
      reply.clearCookie(COOKIE.oauth, { ...baseCookie(deps.env), path: '/api/auth/oauth' });

      const loginUrl = (reason: string) =>
        `${deps.env.WEB_URL}/login?${new URLSearchParams({ oauth: reason })}`;
      if (query.error) return reply.redirect(loginUrl('cancelled'));
      if (!saved || !query.state || !query.code || !safeEqual(saved.state, query.state)) {
        return reply.redirect(loginUrl('expired'));
      }
      try {
        const profile = await deps.oauth.exchangeCode(query.code, redirectUri);
        const user = await completeOAuthSignIn(deps, profile);
        await issueSession(deps, reply, user.id);
      } catch (error) {
        if (error instanceof UnauthorizedError && error.code === 'oauth_email_unverified') {
          return reply.redirect(loginUrl('unverified'));
        }
        if (error instanceof AppError) return reply.redirect(loginUrl('failed'));
        throw error;
      }
      return reply.redirect(`${deps.env.WEB_URL}${saved.returnTo}`);
    });

    if (deps.oauth instanceof DevOAuthProvider) {
      const devProvider = deps.oauth;

      app.get('/api/auth/oauth/dev/authorize', async (request, reply) => {
        const { state = '' } = request.query as { state?: string };
        let csrf = request.cookies[COOKIE.csrf];
        if (!csrf) {
          csrf = randomToken(24);
          reply.setCookie(COOKIE.csrf, csrf, {
            ...baseCookie(deps.env),
            httpOnly: false,
            path: '/',
            maxAge: 31_536_000,
          });
        }
        return reply.type('text/html; charset=utf-8').send(renderDevConsentPage({ state, csrf }));
      });

      app.post('/api/auth/oauth/dev/authorize', async (request, reply) => {
        const body = request.body as Record<string, string | undefined>;
        const email = (body.email ?? '').trim().toLowerCase();
        const firstName = (body.firstName ?? '').trim();
        const lastName = (body.lastName ?? '').trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !firstName) {
          return reply
            .code(400)
            .type('text/html; charset=utf-8')
            .send(
              renderDevConsentPage({
                state: body.state ?? '',
                csrf: request.cookies[COOKIE.csrf] ?? '',
                error: 'Enter an email address and a first name.',
                values: { email, firstName, lastName },
              }),
            );
        }
        const code = devProvider.mintCode({ email, firstName, lastName });
        const params = new URLSearchParams({ code, state: body.state ?? '' });
        return reply.redirect(`/api/auth/oauth/google/callback?${params.toString()}`);
      });
    }
  }
}

/**
 * Who may create an account. Empty (the default) means anyone, which is right for a real
 * product and wrong for a deployed preview on a URL a client has been sent, so a deployment
 * sets SIGNUP_ALLOWLIST to the addresses and domains that are expected (ADR 036).
 */
export function assertMayRegister(allowlist: readonly string[], email: string): void {
  if (allowlist.length === 0) return;
  const address = email.trim().toLowerCase();
  const domain = address.slice(address.indexOf('@'));
  const allowed = allowlist.some((entry) =>
    entry.startsWith('@') ? entry === domain : entry === address,
  );
  if (!allowed) {
    throw new ForbiddenError(
      'This address can’t create an account here. Ask whoever sent you the link to add it.',
      'signup_not_allowed',
    );
  }
}
