import {
  completeUploadSchema,
  documentUploadTargetRequestSchema,
  MAX_DOCUMENT_BYTES,
  recordsUnlockSchema,
  uploadTargetRequestSchema,
  type RecordsStateDto,
} from '@kinfolk/shared/schemas/account';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { AppDeps } from '../../lib/deps';
import { ForbiddenError, NotFoundError, ValidationError } from '../../lib/errors';
import { finalizeImageUpload } from '../../lib/images';
import { requireTreeRole, resolveTreeRole } from '../../lib/treeAccess';
import { requireAuth } from '../auth/authenticate';
import { parseInput } from '../../lib/validate';
import { fileUrl } from '../account/accountRoutes';
import type { FileAuthorizer } from '../files/fileRoutes';
import { grantRecordsUnlock, passphraseMatches, recordsGated, recordsUnlocked, requireRecordsUnlock } from './recordAccess';

/**
 * Person photos and public records. Uploading stores the file and returns its URL; attaching it
 * to the person is an ordinary ChangeSet edit, so it is audited and undoable like any other.
 */
export async function photoRoutes(app: FastifyInstance, opts: { deps: AppDeps; rateLimit: { max: number; timeWindow: string } }) {
  const { deps } = opts;

  const personInTree = async (treeId: string, personId: string) => {
    const person = await deps.prisma.person.findFirst({ where: { id: personId, treeId }, select: { id: true } });
    if (!person) throw new NotFoundError('That person is no longer in this tree.');
  };

  app.post('/api/trees/:treeId/people/:personId/photo/upload-target', async (request) => {
    const { treeId, personId } = request.params as { treeId: string; personId: string };
    const { user } = await requireTreeRole(deps, request, treeId, ['owner', 'editor'], 'You can view this family tree but not change it.');
    await personInTree(treeId, personId);
    const input = parseInput(uploadTargetRequestSchema, request.body);
    return deps.storage.createUploadTarget(`uploads/raw/${user.id}/${randomUUID()}`, input.contentType, input.size);
  });

  app.post('/api/trees/:treeId/people/:personId/photo', async (request) => {
    const { treeId, personId } = request.params as { treeId: string; personId: string };
    const { user } = await requireTreeRole(deps, request, treeId, ['owner', 'editor'], 'You can view this family tree but not change it.');
    await personInTree(treeId, personId);
    const { key } = parseInput(completeUploadSchema, request.body);
    if (!key.startsWith(`uploads/raw/${user.id}/`) || key.includes('..')) throw new ValidationError("That upload doesn't belong to you.");
    const finalKey = await finalizeImageUpload(deps.storage, key, `trees/${treeId}/people/${personId}/${randomUUID()}.webp`);
    return { photoUrl: fileUrl(finalKey) };
  });

  // Whether this deployment asks for a passphrase, and whether this browser has given it.
  app.get('/api/records/state', async (request): Promise<RecordsStateDto> => {
    requireAuth(request);
    return { required: recordsGated(deps), unlocked: recordsUnlocked(deps, request) };
  });

  app.post('/api/records/unlock', { config: { rateLimit: opts.rateLimit } }, async (request, reply) => {
    requireAuth(request);
    const { passphrase } = parseInput(recordsUnlockSchema, request.body);
    if (!passphraseMatches(deps, passphrase)) {
      // 403, not 401: the person is signed in and stays signed in. A 401 would send the client
      // through refresh-and-retry and then bounce them to the sign-in screen.
      throw new ForbiddenError('That passphrase is not right.', 'records_passphrase');
    }
    const expiresAt = grantRecordsUnlock(deps, reply);
    return { unlockedUntil: new Date(expiresAt).toISOString() };
  });

  app.post('/api/trees/:treeId/people/:personId/record/upload-target', async (request) => {
    const { treeId, personId } = request.params as { treeId: string; personId: string };
    const { user } = await requireTreeRole(deps, request, treeId, ['owner', 'editor'], 'You can view this family tree but not change it.');
    requireRecordsUnlock(deps, request);
    await personInTree(treeId, personId);
    const input = parseInput(documentUploadTargetRequestSchema, request.body);
    return deps.storage.createUploadTarget(`uploads/raw/${user.id}/${randomUUID()}`, input.contentType, input.size);
  });

  app.post('/api/trees/:treeId/people/:personId/record', async (request) => {
    const { treeId, personId } = request.params as { treeId: string; personId: string };
    const { user } = await requireTreeRole(deps, request, treeId, ['owner', 'editor'], 'You can view this family tree but not change it.');
    // Both steps ask, so a grant taken on one device cannot finish a record on another.
    requireRecordsUnlock(deps, request);
    await personInTree(treeId, personId);
    const { key } = parseInput(completeUploadSchema, request.body);
    if (!key.startsWith(`uploads/raw/${user.id}/`) || key.includes('..')) throw new ValidationError("That upload doesn't belong to you.");
    const raw = await deps.storage.get(key);
    try {
      if (!raw) throw new ValidationError("The upload didn't arrive. Please choose the file again.");
      if (raw.body.length > MAX_DOCUMENT_BYTES) throw new ValidationError('Choose a PDF smaller than 25 MB.');
      // The bytes decide, never the name or the declared type: a PDF starts with %PDF-.
      if (raw.body.subarray(0, 5).toString('ascii') !== '%PDF-') throw new ValidationError('That file isn’t a PDF. Public records have to be a PDF.');
      const finalKey = `trees/${treeId}/people/${personId}/records/${randomUUID()}.pdf`;
      await deps.storage.put(finalKey, raw.body, 'application/pdf');
      return { publicRecordUrl: fileUrl(finalKey) };
    } finally {
      await deps.storage.delete(key);
    }
  });
}

/**
 * Tree files are readable by members of that tree only — never by share-link visitors. Public
 * records need the passphrase as well, checked here so the PDF cannot be fetched by URL alone
 * (ADR 037).
 */
export function treeFileAuthorizer(deps: AppDeps): FileAuthorizer {
  return async (request: FastifyRequest, key: string) => {
    if (!request.auth) return false;
    const treeId = key.split('/')[1];
    if (!treeId) return false;
    if (key.includes('/records/') && !recordsUnlocked(deps, request)) return false;
    return (await resolveTreeRole(deps, request.auth.user.id, treeId)) !== null;
  };
}
