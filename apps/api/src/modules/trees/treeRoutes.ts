import { changeSetSchema, type ChangeOp } from '@kinfolk/shared/schemas/changeSet';
import { createTreeSchema, deleteTreeSchema, updateTreeSchema, type TreeDto, type TreeRole, type TreeSummaryDto } from '@kinfolk/shared/schemas/tree';
import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../../lib/deps';
import { ValidationError } from '../../lib/errors';
import { graphForVisibility } from '../../lib/graphRows';
import { requireTreeRole, type TreeWithOwner } from '../../lib/treeAccess';
import { parseInput } from '../../lib/validate';
import { requireAuth } from '../auth/authenticate';
import { commitChangeSet, loadGraph } from '../graph/graphService';

export function toTreeDto(tree: TreeWithOwner, role: TreeRole): TreeDto {
  return {
    id: tree.id,
    name: tree.name,
    description: tree.description,
    status: tree.status,
    focusPersonId: tree.focusPersonId,
    version: tree.version,
    role,
    owner: { id: tree.owner.id, name: `${tree.owner.firstName} ${tree.owner.lastName}`.trim() },
    thumbnailUrl: tree.thumbnailUrl,
    createdAt: tree.createdAt.toISOString(),
    updatedAt: tree.updatedAt.toISOString(),
  };
}

export async function treeRoutes(app: FastifyInstance, opts: { deps: AppDeps }) {
  const { deps } = opts;
  const ownerInclude = { owner: { select: { id: true, firstName: true, lastName: true } }, _count: { select: { people: true } } } as const;

  /** Every tree the caller owns or has active access to, newest activity first. */
  app.get('/api/trees', async (request): Promise<{ trees: TreeSummaryDto[] }> => {
    const { user } = requireAuth(request);
    const [owned, shared] = await Promise.all([
      deps.prisma.tree.findMany({ where: { ownerId: user.id }, include: ownerInclude }),
      deps.prisma.access.findMany({
        where: { userId: user.id, status: 'active' },
        include: { tree: { include: ownerInclude } },
      }),
    ]);
    const trees: TreeSummaryDto[] = [
      ...owned.map((tree) => ({ ...toTreeDto(tree, 'owner'), peopleCount: tree._count.people })),
      ...shared
        .filter((access) => access.tree.ownerId !== user.id)
        .map((access) => ({ ...toTreeDto(access.tree, access.role), peopleCount: access.tree._count.people })),
    ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return { trees };
  });

  app.post('/api/trees', async (request, reply) => {
    const { user } = requireAuth(request);
    const input = parseInput(createTreeSchema, request.body);
    const tree = await deps.prisma.tree.create({
      data: { name: input.name, description: input.description, ownerId: user.id },
      include: { owner: { select: { id: true, firstName: true, lastName: true } } },
    });
    await deps.prisma.auditEvent.create({
      data: { treeId: tree.id, actorId: user.id, action: 'tree.create', targetType: 'tree', targetId: tree.id, after: { name: tree.name } },
    });
    // Invitees who build their own tree advance their invitation (SPEC §5.5).
    await deps.prisma.invitation.updateMany({
      where: { inviteeUserId: user.id, stage: 'joined', revokedAt: null },
      data: { stage: 'tree_created', treeCreatedAt: deps.now(), inviteeTreeId: tree.id },
    });
    return reply.code(201).send({ tree: toTreeDto(tree, 'owner') });
  });

  app.get('/api/trees/:treeId', async (request) => {
    const { treeId } = request.params as { treeId: string };
    const { tree, role } = await requireTreeRole(deps, request, treeId, ['owner', 'editor', 'viewer', 'reviewer']);
    return { tree: toTreeDto(tree, role) };
  });

  app.patch('/api/trees/:treeId', async (request) => {
    const { treeId } = request.params as { treeId: string };
    const { tree, user } = await requireTreeRole(deps, request, treeId, ['owner'], 'Only the tree owner can rename it.');
    const input = parseInput(updateTreeSchema, request.body);
    const updated = await deps.prisma.tree.update({
      where: { id: tree.id },
      data: { ...(input.name !== undefined ? { name: input.name } : {}), ...(input.description !== undefined ? { description: input.description } : {}) },
      include: { owner: { select: { id: true, firstName: true, lastName: true } } },
    });
    await deps.prisma.auditEvent.create({
      data: {
        treeId: tree.id,
        actorId: user.id,
        action: 'tree.update',
        targetType: 'tree',
        targetId: tree.id,
        before: { name: tree.name, description: tree.description },
        after: { name: updated.name, description: updated.description },
      },
    });
    return { tree: toTreeDto(updated, 'owner') };
  });

  app.delete('/api/trees/:treeId', async (request, reply) => {
    const { treeId } = request.params as { treeId: string };
    const { tree } = await requireTreeRole(deps, request, treeId, ['owner'], 'Only the tree owner can delete it.');
    const { confirmName } = parseInput(deleteTreeSchema, request.body);
    if (confirmName.trim() !== tree.name.trim()) {
      const message = `Type the tree’s name, “${tree.name}”, exactly to confirm.`;
      throw new ValidationError(message, { confirmName: message });
    }
    await deps.prisma.tree.delete({ where: { id: tree.id } });
    return reply.code(204).send();
  });

  app.get('/api/trees/:treeId/graph', async (request) => {
    const { treeId } = request.params as { treeId: string };
    const { tree, role } = await requireTreeRole(deps, request, treeId, ['owner', 'editor', 'viewer', 'reviewer']);
    const graph = await loadGraph(deps.prisma, tree.id, tree.focusPersonId);
    return { tree: toTreeDto(tree, role), graph: graphForVisibility(graph, 'full') };
  });

  app.post('/api/trees/:treeId/changes', { bodyLimit: 8 * 1024 * 1024 }, async (request) => {
    const { treeId } = request.params as { treeId: string };
    const { tree, role, user } = await requireTreeRole(
      deps,
      request,
      treeId,
      ['owner', 'editor'],
      'You can view this family tree but not change it.',
    );
    const input = parseInput(changeSetSchema, request.body);
    return commitChangeSet(deps, {
      treeId: tree.id,
      actorId: user.id,
      role,
      ops: input.ops as ChangeOp[],
      description: input.description,
    });
  });
}
