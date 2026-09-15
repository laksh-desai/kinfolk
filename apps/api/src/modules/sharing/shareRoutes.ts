import { createShareLinkSchema, type CreatedShareLinkDto, type ShareLinkDto, type SharedTreeDto } from '@kinfolk/shared/schemas/collaboration';
import type { ShareLink, User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../../lib/deps';
import { GoneError, NotFoundError } from '../../lib/errors';
import { graphForVisibility } from '../../lib/graphRows';
import { mintLinkToken, readLinkToken, userDisplayName } from '../../lib/linkTokens';
import { requireTreeRole } from '../../lib/treeAccess';
import { parseInput } from '../../lib/validate';
import { loadGraph } from '../graph/graphService';

const INVALID_LINK = 'This share link isn’t valid. Check that you copied the whole link, or ask the person who sent it for a new one.';

function toShareLinkDto(link: ShareLink & { createdBy: Pick<User, 'firstName' | 'lastName'> | null }, now: Date): ShareLinkDto {
  const status = link.revokedAt ? 'revoked' : link.expiresAt && link.expiresAt <= now ? 'expired' : 'active';
  return {
    id: link.id,
    createdAt: link.createdAt.toISOString(),
    expiresAt: link.expiresAt?.toISOString() ?? null,
    revokedAt: link.revokedAt?.toISOString() ?? null,
    createdBy: userDisplayName(link.createdBy),
    status,
  };
}

/**
 * Share links (SPEC §5.6): owner-created, optionally expiring, revocable, and read-only. The
 * public endpoint returns only the redacted allow-list (SPEC §2) — enforced here, not in the UI.
 */
export async function shareRoutes(app: FastifyInstance, opts: { deps: AppDeps }) {
  const { deps } = opts;
  const withCreator = { createdBy: { select: { firstName: true, lastName: true } } } as const;

  app.get('/api/trees/:treeId/share-links', async (request) => {
    const { treeId } = request.params as { treeId: string };
    const { tree } = await requireTreeRole(deps, request, treeId, ['owner'], 'Only the tree owner can manage share links.');
    const links = await deps.prisma.shareLink.findMany({ where: { treeId: tree.id }, include: withCreator, orderBy: { createdAt: 'desc' } });
    return { links: links.map((link) => toShareLinkDto(link, deps.now())) };
  });

  app.post('/api/trees/:treeId/share-links', async (request, reply): Promise<CreatedShareLinkDto> => {
    const { treeId } = request.params as { treeId: string };
    const { tree, user } = await requireTreeRole(deps, request, treeId, ['owner'], 'Only the tree owner can create share links.');
    const { expiresInDays } = parseInput(createShareLinkSchema, request.body ?? {});
    const now = deps.now();
    const id = randomUUID();
    const expiresAt = expiresInDays === null ? null : new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000);
    const { token, tokenHash } = mintLinkToken(deps.env.SESSION_SECRET, 'share-link', id, expiresAt, now);
    const link = await deps.prisma.shareLink.create({ data: { id, treeId: tree.id, tokenHash, expiresAt, createdById: user.id, createdAt: now }, include: withCreator });
    await deps.prisma.auditEvent.create({
      data: { treeId: tree.id, actorId: user.id, action: 'share.create', targetType: 'share_link', targetId: link.id, after: { expiresAt: expiresAt?.toISOString() ?? null } },
    });
    reply.code(201);
    return { link: toShareLinkDto(link, now), url: `${deps.env.WEB_URL}/s/${token}` };
  });

  app.delete('/api/trees/:treeId/share-links/:linkId', async (request, reply) => {
    const { treeId, linkId } = request.params as { treeId: string; linkId: string };
    const { tree, user } = await requireTreeRole(deps, request, treeId, ['owner'], 'Only the tree owner can turn off share links.');
    const link = await deps.prisma.shareLink.findFirst({ where: { id: linkId, treeId: tree.id } });
    if (!link) throw new NotFoundError('That share link no longer exists.');
    if (!link.revokedAt) {
      await deps.prisma.shareLink.update({ where: { id: link.id }, data: { revokedAt: deps.now() } });
      await deps.prisma.auditEvent.create({ data: { treeId: tree.id, actorId: user.id, action: 'share.revoke', targetType: 'share_link', targetId: link.id } });
    }
    return reply.code(204).send();
  });

  /** Public and read-only. No session needed; nothing beyond the redacted allow-list is returned. */
  app.get('/api/shared/:token', async (request, reply): Promise<SharedTreeDto> => {
    const { token } = request.params as { token: string };
    reply.header('cache-control', 'no-store').header('x-robots-tag', 'noindex, nofollow');
    const parsed = readLinkToken(deps.env.SESSION_SECRET, 'share-link', token);
    if (!parsed) throw new NotFoundError(INVALID_LINK, 'share_link_invalid');
    const link = await deps.prisma.shareLink.findUnique({ where: { id: parsed.rowId }, include: { tree: true } });
    if (!link || link.tokenHash !== parsed.tokenHash) throw new NotFoundError(INVALID_LINK, 'share_link_invalid');
    if (link.revokedAt) throw new GoneError('The owner has turned off this share link. Ask them for a new one if you still need to see the tree.', 'share_link_revoked');
    if (link.expiresAt && link.expiresAt <= deps.now()) throw new GoneError('This share link has expired. Ask the person who sent it for a new one.', 'share_link_expired');
    const graph = await loadGraph(deps.prisma, link.tree.id, link.tree.focusPersonId);
    return { tree: { name: link.tree.name, status: link.tree.status }, graph: graphForVisibility(graph, 'redacted') };
  });
}
