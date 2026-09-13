import type { TreeGraph } from '@kinfolk/shared/schemas/graph';
import type { TreeDto } from '@kinfolk/shared/schemas/tree';
import { queryOptions } from '@tanstack/react-query';
import { api } from '../../lib/api';

export interface TreeGraphResponse {
  tree: TreeDto;
  graph: TreeGraph;
}

export const treeGraphQuery = (treeId: string) =>
  queryOptions({
    queryKey: ['tree', treeId, 'graph'] as const,
    queryFn: () => api<TreeGraphResponse>(`/api/trees/${encodeURIComponent(treeId)}/graph`),
    staleTime: 60_000,
  });
