import compress from '@fastify/compress';
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
import { eventRoutes } from './modules/events/eventRoutes';
import { invitationRoutes } from './modules/invitations/invitationRoutes';
import { reviewRoutes } from './modules/review/reviewRoutes';
import { shareRoutes } from './modules/sharing/shareRoutes';
import { photoRoutes, treeFileAuthorizer } from './modules/trees/photoRoutes';
import { treeRoutes } from './modules/trees/treeRoutes';
import { webRoutes } from './modules/web/webRoutes';

export interface BuildAppOptions {
  logger?: boolean;
  authRateLimit?: AuthRateLimits;
  /**
   * The ceiling on everything else, per address. Generous enough that a person never meets it
   * (a tree page is a handful of requests), low enough that a leaked share link or a stolen
   * cookie cannot pull a graph in a loop. Routes with their own limit keep it.
   */
  globalRateLimit?: AuthRateLimits;
  /** Sharing and invitation emails: a few per hour is plenty for a person, and stops mail abuse. */
  inviteRateLimit?: InviteRateLimits;
  /** Path to the built web app. Given it, this process serves the whole product (SPEC §9). */
  webDist?: string;
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
  await app.register(rateLimit, { global: true, ...(options.globalRateLimit ?? { max: 600, timeWindow: '1 minute' }) });
  // A graph is hundreds of kilobytes of very repetitive JSON, and the app's chunks are served
  // from here too. Images and PDFs are already compressed and are left alone by the default
  // type filter; anything under a kilobyte is not worth the round trip.
  await app.register(compress, { global: true, threshold: 1024, encodings: ['br', 'gzip'] });

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

  // Set once: Fastify allows one per instance. With a web build, anything that isn't an API
  // route and isn't a file is a screen of the app (SPEC §6.1) — `appHtml` is filled in below.
  let appHtml: string | null = null;
  app.setNotFoundHandler((request, reply) => {
    if (appHtml !== null && request.method === 'GET' && !request.url.startsWith('/api/')) {
      return reply.code(200).header('cache-control', 'no-store').type('text/html').send(appHtml);
    }
    return reply.code(404).send({ error: { code: 'not_found', message: "We couldn't find that." } });
  });

  /**
   * What a platform polls to decide the instance is alive. Unauthenticated and cheap, but it
   * asks the database a question, because a process that cannot reach Postgres is not healthy.
   */
  app.get('/api/health', { config: { rateLimit: false } }, async (_request, reply) => {
    try {
      await deps.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok' };
    } catch {
      return reply.code(503).send({ status: 'unavailable', error: { code: 'database_unavailable', message: 'The database is not reachable.' } });
    }
  });

  const authRateLimit = options.authRateLimit ?? { max: 10, timeWindow: '1 minute' };
  await app.register(authRoutes, { deps, rateLimit: authRateLimit });
  await app.register(accountRoutes, { deps, rateLimit: authRateLimit });
  await app.register(treeRoutes, { deps });
  await app.register(photoRoutes, { deps, rateLimit: authRateLimit });
  const inviteRateLimit = options.inviteRateLimit ?? { max: 30, timeWindow: '1 hour' };
  await app.register(accessRoutes, { deps, rateLimit: inviteRateLimit });
  await app.register(shareRoutes, { deps });
  await app.register(invitationRoutes, { deps, rateLimit: inviteRateLimit });
  await app.register(reviewRoutes, { deps, rateLimit: inviteRateLimit });
  await app.register(eventRoutes, { deps });
  await app.register(fileRoutes, { deps, authorizers: { 'avatars/': avatarAuthorizer, 'trees/': treeFileAuthorizer(deps) } });
  if (options.webDist) appHtml = await webRoutes(app, { root: options.webDist });

  return app;
}
