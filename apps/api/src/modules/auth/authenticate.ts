import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AppDeps } from '../../lib/deps';
import { UnauthorizedError } from '../../lib/errors';
import { readAuth, type AuthContext } from './sessionService';

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

export function registerAuthContext(app: FastifyInstance, deps: AppDeps): void {
  app.decorateRequest('auth', null);
  app.addHook('onRequest', async (request) => {
    if (request.url.startsWith('/api/')) request.auth = await readAuth(deps, request);
  });
}

/** Use in handlers that need a signed-in user. Every protected route fails the same way. */
export function requireAuth(request: FastifyRequest): AuthContext {
  if (!request.auth) throw new UnauthorizedError();
  return request.auth;
}
