import { completeUploadSchema, uploadTargetRequestSchema } from '@kinfolk/shared/schemas/account';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { AppDeps } from '../../lib/deps';
import { NotFoundError, ValidationError } from '../../lib/errors';
import { finalizeImageUpload } from '../../lib/images';
import { requireTreeRole, resolveTreeRole } from '../../lib/treeAccess';
import { parseInput } from '../../lib/validate';
import { fileUrl } from '../account/accountRoutes';
import type { FileAuthorizer } from '../files/fileRoutes';

/**
 * Person photos. Uploading stores a resized image and returns its URL; attaching it to the
 * person is an ordinary ChangeSet edit, so it is audited and undoable like any other.
 */
export async function photoRoutes(app: FastifyInstance, opts: { deps: AppDeps }) {
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
}

/** Tree files are readable by members of that tree only — never by share-link visitors. */
export function treeFileAuthorizer(deps: AppDeps): FileAuthorizer {
  return async (request: FastifyRequest, key: string) => {
    if (!request.auth) return false;
    const treeId = key.split('/')[1];
    if (!treeId) return false;
    return (await resolveTreeRole(deps, request.auth.user.id, treeId)) !== null;
  };
}
