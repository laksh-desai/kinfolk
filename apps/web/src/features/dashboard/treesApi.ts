import type { CreateTreeInput, TreeDto, TreeSummaryDto, UpdateTreeInput } from '@kinfolk/shared/schemas/tree';
import { queryOptions } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { queryClient } from '../../lib/queryClient';
import { treeGraphQuery, type TreeGraphResponse } from '../tree/treeQueries';

export const treesQuery = queryOptions({
  queryKey: ['trees'] as const,
  queryFn: async () => (await api<{ trees: TreeSummaryDto[] }>('/api/trees')).trees,
  staleTime: 30_000,
});

export const treesApi = {
  create: (input: CreateTreeInput) => api<{ tree: TreeDto }>('/api/trees', { method: 'POST', body: input }),
  update: (treeId: string, input: UpdateTreeInput) => api<{ tree: TreeDto }>(`/api/trees/${treeId}`, { method: 'PATCH', body: input }),
  remove: (treeId: string, confirmName: string) => api<undefined>(`/api/trees/${treeId}`, { method: 'DELETE', body: { confirmName } }),
};

/** After a rename, every cached copy of the tree shows the new name at once. */
export function storeTreeDetails(tree: TreeDto): void {
  queryClient.setQueryData<TreeGraphResponse>(treeGraphQuery(tree.id).queryKey, (current) =>
    current ? { ...current, tree: { ...current.tree, name: tree.name, description: tree.description, updatedAt: tree.updatedAt } } : current,
  );
  queryClient.setQueryData<TreeSummaryDto[]>(treesQuery.queryKey, (current) =>
    current?.map((summary) => (summary.id === tree.id ? { ...summary, name: tree.name, description: tree.description, updatedAt: tree.updatedAt } : summary)),
  );
}

export function forgetTree(treeId: string): void {
  queryClient.removeQueries({ queryKey: treeGraphQuery(treeId).queryKey });
  queryClient.setQueryData<TreeSummaryDto[]>(treesQuery.queryKey, (current) => current?.filter((summary) => summary.id !== treeId));
}
