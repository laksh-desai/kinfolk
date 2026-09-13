import type { LayoutNode } from '@kinfolk/shared/layout/layoutTypes';
import type { WorldRect } from './viewport';

export const VIRTUALIZE_ABOVE = 200;

/**
 * Cards worth rendering: all of them for ordinary trees; above VIRTUALIZE_ABOVE people, only
 * those intersecting the visible area plus a margin, plus any that must stay mounted (the
 * selected card keeps keyboard focus).
 */
export function visibleNodes(nodes: readonly LayoutNode[], visible: WorldRect, keep: ReadonlySet<string> = new Set(), margin = 400): LayoutNode[] {
  if (nodes.length <= VIRTUALIZE_ABOVE) return [...nodes];
  const left = visible.x - margin;
  const top = visible.y - margin;
  const right = visible.x + visible.width + margin;
  const bottom = visible.y + visible.height + margin;
  return nodes.filter(
    (node) =>
      keep.has(node.personId) || (node.x < right && node.x + node.width > left && node.y < bottom && node.y + node.height > top),
  );
}
