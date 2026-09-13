import type { User } from '@prisma/client';
import type { DeletionSummaryDto } from '@kinfolk/shared/schemas/account';
import type { AppDeps } from '../../lib/deps';
import { toUserDto } from '../auth/sessionService';

export async function deletionSummary(_deps: AppDeps, user: User): Promise<DeletionSummaryDto> {
  return { email: user.email, ownedTrees: [], sharedTreeCount: 0 };
}

export async function buildAccountExport(deps: AppDeps, user: User) {
  return {
    format: 'kinfolk-account-export',
    version: 1,
    exportedAt: deps.now().toISOString(),
    account: toUserDto(user),
    trees: [] as unknown[],
  };
}

export async function deleteAccount(deps: AppDeps, user: User): Promise<void> {
  await deps.prisma.user.delete({ where: { id: user.id } });
}
