import { applyChangeSet } from '@kinfolk/shared/graph/applyChangeSet';
import type { ChangeOp } from '@kinfolk/shared/schemas/changeSet';
import type { TreeGraph } from '@kinfolk/shared/schemas/graph';

/** Ops of changes applied on screen but not yet confirmed by the server, oldest first, per tree. */
const pending = new Map<string, ChangeOp[][]>();

export function trackPending(treeId: string, ops: ChangeOp[]): void {
  pending.set(treeId, [...(pending.get(treeId) ?? []), ops]);
}

export function settlePending(treeId: string, ops: ChangeOp[]): void {
  pending.set(
    treeId,
    (pending.get(treeId) ?? []).filter((entry) => entry !== ops),
  );
}

export function clearPending(treeId?: string): void {
  if (treeId) pending.delete(treeId);
  else pending.clear();
}

/**
 * Replays unsaved changes on top of a freshly fetched graph, so a refetch while saves are
 * queued (or offline) never makes the user's edits vanish from the screen. A change the
 * server already has (say it committed while the fetch was in flight) no longer applies
 * cleanly and is skipped; the server copy already contains it.
 */
export function rebaseOnPending(treeId: string, graph: TreeGraph): TreeGraph {
  let rebased = graph;
  for (const ops of pending.get(treeId) ?? []) {
    try {
      rebased = applyChangeSet(rebased, ops, { now: new Date().toISOString() }).graph;
    } catch {
      // Already applied on the server, or overtaken by another change; the fetched graph wins.
    }
  }
  return rebased;
}
