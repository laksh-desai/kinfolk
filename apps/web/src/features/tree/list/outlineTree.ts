import type { GraphIndex } from '@kinfolk/shared/graph/graphIndex';
import type { LayoutResult } from '@kinfolk/shared/layout/layoutTypes';

export interface OutlineFamily {
  /** Null for someone with no partnership in this generation. */
  unionId: string | null;
  /** People listed under this family, in partner order. Each person is listed once in the whole outline. */
  memberIds: string[];
  /** Partners listed in an earlier family (remarriage), mentioned by name only. */
  alsoIn: string[];
  childIds: string[];
}

export interface OutlineGeneration {
  /** 1 = the oldest generation shown. */
  number: number;
  families: OutlineFamily[];
}

/**
 * The accessible outline of a tree (SPEC §5.3): generations top to bottom, then family units in
 * canvas order, left to right. Built from the same layout the canvas draws, so both views agree.
 * People hidden by a collapsed branch are omitted, as on the canvas.
 */
export function outlineTree(index: GraphIndex, layout: LayoutResult): OutlineGeneration[] {
  const byGeneration = new Map<number, typeof layout.nodes>();
  for (const node of layout.nodes) {
    const row = byGeneration.get(node.generation) ?? [];
    row.push(node);
    byGeneration.set(node.generation, row);
  }
  const listed = new Set<string>();
  const shown = new Set(layout.nodes.map((node) => node.personId));
  const generations = [...byGeneration.keys()].sort((a, b) => a - b);

  return generations.map((generation, position) => {
    const row = (byGeneration.get(generation) ?? []).slice().sort((a, b) => a.x - b.x || a.personId.localeCompare(b.personId));
    const families: OutlineFamily[] = [];
    for (const node of row) {
      const unions = index.unionsOf(node.personId).filter((union) => union.partnerBId !== null || index.childEdgesOf(union.id).length > 0);
      if (unions.length === 0) {
        if (!listed.has(node.personId)) {
          listed.add(node.personId);
          families.push({ unionId: null, memberIds: [node.personId], alsoIn: [], childIds: [] });
        }
        continue;
      }
      for (const union of unions) {
        if (families.some((family) => family.unionId === union.id)) continue;
        const partners = [union.partnerAId, union.partnerBId].filter((id): id is string => id !== null && shown.has(id));
        const memberIds = partners.filter((id) => !listed.has(id));
        const alsoIn = partners.filter((id) => listed.has(id));
        for (const id of memberIds) listed.add(id);
        const childIds = index
          .childEdgesOf(union.id)
          .map((edge) => edge.childId)
          .filter((id) => shown.has(id));
        families.push({ unionId: union.id, memberIds, alsoIn, childIds });
      }
    }
    return { number: position + 1, families: families.filter((family) => family.memberIds.length > 0 || family.childIds.length > 0) };
  });
}
