import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { registerCsrf } from './lib/csrf';
import type { AppDeps } from './lib/deps';
import { AppError } from './lib/errors';
import { redactUrl } from './lib/logging';
import { accountRoutes } from './modules/account/accountRoutes';
import { registerAuthContext } from './modules/auth/authenticate';
import { authRoutes, type AuthRateLimits } from './modules/auth/authRoutes';
import { avatarAuthorizer, fileRoutes } from './modules/files/fileRoutes';
import { accessRoutes, type InviteRateLimits } from './modules/access/accessRoutes';
import { invitationRoutes } from './modules/invitations/invitationRoutes';
import { reviewRoutes } from './modules/review/reviewRoutes';
import { shareRoutes } from './modules/sharing/shareRoutes';
import { photoRoutes, treeFileAuthorizer } from './modules/trees/photoRoutes';
import { treeRoutes } from './modules/trees/treeRoutes';

export interface BuildAppOptions {
  logger?: boolean;
  authRateLimit?: AuthRateLimits;
  /** Sharing and invitation emails: a few per hour is plenty for a person, and stops mail abuse. */
  inviteRateLimit?: InviteRateLimits;
}

export async function buildApp(deps: AppDeps, options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    trustProxy: true,
    bodyLimit: 1024 * 1024,
    // Signed share, review, invite, and upload tokens travel as path params and exceed the 100-char default.
    routerOptions: { maxParamLength: 1024 },
    logger: options.logger
      ? {
          // No bodies, headers, or query strings: they can carry PII and tokens.
          serializers: {
            req: (request) => ({ method: request.method, url: redactUrl(request.url) }),
            res: (response) => ({ statusCode: response.statusCode }),
          },
        }
      : false,
  });

  await app.register(cookie);
  // Google Places is the only third party, and only when a key is configured (SPEC §6.23).
  const places = deps.env.VITE_GOOGLE_PLACES_KEY ? ['https://maps.googleapis.com'] : [];
  const placesAssets = deps.env.VITE_GOOGLE_PLACES_KEY ? ['https://maps.gstatic.com', 'https://maps.googleapis.com'] : [];
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:', ...placesAssets],
        styleSrc: ["'self'", "'unsafe-inline'", ...(places.length ? ['https://fonts.googleapis.com'] : [])],
        scriptSrc: ["'self'", ...places],
        connectSrc: ["'self'", ...places],
        fontSrc: ["'self'", ...(places.length ? ['https://fonts.gstatic.com'] : [])],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        baseUri: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    // "no-referrer" makes browsers send `Origin: null` on form posts, defeating the CSRF Origin
    // check. URLs carry no PII, and cross-site requests still get only the origin.
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });
  await app.register(rateLimit, { global: false });

  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_request, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(body as string)));
  });

  registerAuthContext(app, deps);
  registerCsrf(app, deps.env);

  app.setErrorHandler((error: FastifyError | AppError, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: { code: error.code, message: error.message, ...(error.fields ? { fields: error.fields } : {}) },
      });
    }
    const status = error.statusCode ?? 500;
    if (status === 429) {
      return reply.code(429).send({
        error: { code: 'rate_limited', message: 'Too many attempts. Please wait a minute and try again.' },
      });
    }
    if (status === 413) {
      return reply.code(413).send({ error: { code: 'too_large', message: 'That file is too large.' } });
    }
    if (status >= 400 && status < 500) {
      return reply.code(status).send({
        error: { code: 'bad_request', message: "Something about that request wasn't right. Please try again." },
      });
    }
    request.log.error({ err: { name: error.name, message: error.message, stack: error.stack } }, 'unhandled error');
    return reply.code(500).send({
      error: { code: 'server_error', message: 'Something went wrong on our side. Your last change was not saved — please try again.' },
    });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({ error: { code: 'not_found', message: "We couldn't find that." } });
    void request;
  });

  const authRateLimit = options.authRateLimit ?? { max: 10, timeWindow: '1 minute' };
  await app.register(authRoutes, { deps, rateLimit: authRateLimit });
  await app.register(accountRoutes, { deps });
  await app.register(treeRoutes, { deps });
  await app.register(photoRoutes, { deps });
  const inviteRateLimit = options.inviteRateLimit ?? { max: 30, timeWindow: '1 hour' };
  await app.register(accessRoutes, { deps, rateLimit: inviteRateLimit });
  await app.register(shareRoutes, { deps });
  await app.register(invitationRoutes, { deps, rateLimit: inviteRateLimit });
  await app.register(reviewRoutes, { deps, rateLimit: inviteRateLimit });
  await app.register(fileRoutes, { deps, authorizers: { 'avatars/': avatarAuthorizer, 'trees/': treeFileAuthorizer(deps) } });

  return app;
}
