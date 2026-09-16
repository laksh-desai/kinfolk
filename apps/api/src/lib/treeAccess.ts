import type { Tree, User } from '@prisma/client';
import type { TreeRole } from '@kinfolk/shared/schemas/tree';
import type { FastifyRequest } from 'fastify';
import { requireAuth } from '../modules/auth/authenticate';
import type { AppDeps } from './deps';
import { ForbiddenError, NotFoundError } from './errors';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TreeWithOwner = Tree & { owner: Pick<User, 'id' | 'firstName' | 'lastName'> };

export interface TreeAccessContext {
  tree: TreeWithOwner;
  role: TreeRole;
  user: User;
}

export const TREE_NOT_FOUND = "We couldn't find that family tree. It may have been deleted, or it hasn't been shared with you.";

/**
 * The caller's role on a tree, resolved from the database on every request (CLAUDE.md
 * invariant 5). Never trusts anything the client says about its role. Returns null for
 * non-members so callers answer 404 and don't reveal that the tree exists.
 */
export async function resolveTreeRole(deps: AppDeps, userId: string, treeId: string): Promise<{ tree: TreeWithOwner; role: TreeRole } | null> {
  if (!UUID.test(treeId)) return null;
  const tree = await deps.prisma.tree.findUnique({
    where: { id: treeId },
    include: { owner: { select: { id: true, firstName: true, lastName: true } } },
  });
  if (!tree) return null;
  if (tree.ownerId === userId) return { tree, role: 'owner' };
  const access = await deps.prisma.access.findFirst({ where: { treeId, userId, status: 'active' } });
  if (access) return { tree, role: access.role };
  const review = await deps.prisma.reviewAssignment.findFirst({ where: { treeId, reviewerUserId: userId, revokedAt: null } });
  if (review) return { tree, role: 'reviewer' };
  return null;
}

export async function requireTreeRole(
  deps: AppDeps,
  request: FastifyRequest,
  treeId: string,
  allowed: readonly TreeRole[],
  forbiddenMessage = "You don't have permission to do that on this family tree.",
): Promise<TreeAccessContext> {
  const { user } = requireAuth(request);
  const resolved = await resolveTreeRole(deps, user.id, treeId);
  if (!resolved) throw new NotFoundError(TREE_NOT_FOUND, 'tree_not_found');
  if (!allowed.includes(resolved.role)) throw new ForbiddenError(forbiddenMessage);
  return { ...resolved, user };
}

