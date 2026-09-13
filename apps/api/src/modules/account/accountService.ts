import type { User } from '@prisma/client';
import type { DeletionSummaryDto } from '@kinfolk/shared/schemas/account';
import type { AppDeps } from '../../lib/deps';
import { toUserDto } from '../auth/sessionService';
import { loadGraph } from '../graph/graphService';

export async function deletionSummary(deps: AppDeps, user: User): Promise<DeletionSummaryDto> {
  const [owned, sharedTreeCount] = await Promise.all([
    deps.prisma.tree.findMany({
      where: { ownerId: user.id },
      select: { id: true, name: true, _count: { select: { people: true } } },
      orderBy: { name: 'asc' },
    }),
    deps.prisma.access.count({ where: { userId: user.id, status: 'active' } }),
  ]);
  return {
    email: user.email,
    ownedTrees: owned.map((tree) => ({ id: tree.id, name: tree.name, peopleCount: tree._count.people })),
    sharedTreeCount,
  };
}

/** Everything the account owns, in one JSON document: profile plus every owned tree's full graph. */
export async function buildAccountExport(deps: AppDeps, user: User) {
  const trees = await deps.prisma.tree.findMany({ where: { ownerId: user.id }, orderBy: { createdAt: 'asc' } });
  return {
    format: 'kinfolk-account-export',
    version: 1,
    exportedAt: deps.now().toISOString(),
    account: toUserDto(user),
    trees: await Promise.all(
      trees.map(async (tree) => ({
        id: tree.id,
        name: tree.name,
        description: tree.description,
        status: tree.status,
        createdAt: tree.createdAt.toISOString(),
        graph: await loadGraph(deps.prisma, tree.id, tree.focusPersonId),
      })),
    ),
  };
}

/** Owned trees (and everything in them) cascade with the user row. */
export async function deleteAccount(deps: AppDeps, user: User): Promise<void> {
  await deps.prisma.user.delete({ where: { id: user.id } });
}
