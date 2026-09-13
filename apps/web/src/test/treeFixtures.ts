import { buildSeedTree } from '@kinfolk/shared/fixtures/seedTree';
import type { TreeGraph } from '@kinfolk/shared/schemas/graph';
import type { TreeDto } from '@kinfolk/shared/schemas/tree';

export const TREE_ID = '11111111-1111-4111-8111-111111111111';

export function treeDto(overrides: Partial<TreeDto> = {}): TreeDto {
  return {
    id: TREE_ID,
    name: 'Sharma family',
    description: null,
    status: 'draft',
    focusPersonId: null,
    version: 1,
    role: 'owner',
    owner: { id: '00000000-0000-4000-8000-000000000001', name: 'Asha Rao' },
    thumbnailUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

export function seedResponse(overrides: Partial<TreeDto> = {}) {
  const seed = buildSeedTree();
  const graph: TreeGraph = seed.graph;
  return { seed, body: { tree: treeDto({ focusPersonId: graph.focusPersonId, ...overrides }), graph } };
}
