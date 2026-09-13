import type { GraphIndex } from '@kinfolk/shared/graph/graphIndex';
import type { LayoutNode } from '@kinfolk/shared/layout/layoutTypes';

export type NavKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

/**
 * Moves the selection along relationships: up to a parent, down to a child, left/right to the
 * neighbouring card in the same generation row. When several relatives qualify, picks the one
 * horizontally closest. Returns the current id when there is nowhere to go.
 */
export function nextSelection(currentId: string, key: NavKey, nodes: readonly LayoutNode[], index: GraphIndex): string {
  const byId = new Map(nodes.map((node) => [node.personId, node]));
  const current = byId.get(currentId);
  if (!current) return currentId;
  const centre = (node: LayoutNode) => node.x + node.width / 2;
  const closest = (ids: string[]) =>
    ids
      .flatMap((id) => byId.get(id) ?? [])
      .sort((a, b) => Math.abs(centre(a) - centre(current)) - Math.abs(centre(b) - centre(current)) || a.x - b.x)[0]?.personId;

  if (key === 'ArrowUp') return closest(index.parentsOf(currentId).map((link) => link.parentId)) ?? currentId;
  if (key === 'ArrowDown') return closest(index.childrenOf(currentId).map((link) => link.childId)) ?? currentId;

  const row = nodes.filter((node) => node.y === current.y).sort((a, b) => a.x - b.x);
  const position = row.findIndex((node) => node.personId === currentId);
  const neighbour = row[position + (key === 'ArrowRight' ? 1 : -1)];
  return neighbour?.personId ?? currentId;
}

export const NAV_KEYS: ReadonlySet<string> = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
