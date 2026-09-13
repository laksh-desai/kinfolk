import { MAX_IMAGE_BYTES } from '@kinfolk/shared/schemas/account';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AppDeps } from '../../lib/deps';
import { ForbiddenError, NotFoundError, ValidationError } from '../../lib/errors';
import { FsStorage } from '../../lib/storage/fsStorage';
import { requireAuth } from '../auth/authenticate';

export type FileAuthorizer = (request: FastifyRequest, key: string) => Promise<boolean>;

/**
 * Serves stored files through the API so every read is authorised. Authorizers are
 * registered per key prefix by the modules that own those files.
 */
export async function fileRoutes(
  app: FastifyInstance,
  opts: { deps: AppDeps; authorizers: Record<string, FileAuthorizer> },
) {
  const { deps } = opts;

  app.get('/api/files/*', async (request, reply) => {
    const key = (request.params as { '*': string })['*'];
    const prefix = Object.keys(opts.authorizers).find((candidate) => key.startsWith(candidate));
    const authorize = prefix ? opts.authorizers[prefix] : undefined;
    if (!authorize || key.includes('..')) throw new NotFoundError();
    if (!(await authorize(request, key))) throw new NotFoundError();
    const object = await deps.storage.get(key);
    if (!object) throw new NotFoundError();
    return reply
      .type(object.contentType)
      .header('cache-control', 'private, max-age=86400, immutable')
      .header('x-content-type-options', 'nosniff')
      .send(object.body);
  });

  const storage = deps.storage;
  if (storage instanceof FsStorage) {
    app.addContentTypeParser(
      ['image/jpeg', 'image/png', 'image/webp'],
      { parseAs: 'buffer', bodyLimit: MAX_IMAGE_BYTES },
      (_request, body, done) => done(null, body),
    );

    app.put('/api/uploads/:grant', { bodyLimit: MAX_IMAGE_BYTES }, async (request, reply) => {
      requireAuth(request);
      const grant = storage.verifyGrant((request.params as { grant: string }).grant);
      if (!grant) throw new ForbiddenError('This upload link has expired. Choose the file again.', 'upload_expired');
      const contentType = request.headers['content-type'];
      if (contentType !== grant.contentType) {
        throw new ValidationError('The file type changed during upload. Choose the file again.');
      }
      const body = request.body;
      if (!Buffer.isBuffer(body) || body.length === 0) throw new ValidationError('That file is empty.');
      if (body.length > grant.maxBytes) throw new ValidationError('Choose an image smaller than 8 MB.');
      await storage.put(grant.key, body, grant.contentType);
      return reply.code(204).send();
    });
  }
}

export const avatarAuthorizer: FileAuthorizer = async (request) => request.auth !== null;
