import { applyChangeSet } from '../graph/applyChangeSet';
import { indexGraph } from '../graph/graphIndex';
import type { ChangeOp } from '../schemas/changeSet';
import type { TreeGraph } from '../schemas/graph';
import type { ParentChildKind } from '../schemas/parentChild';
import type { UnionPatch } from '../schemas/union';
import { PlanError } from './planState';

/** Fixing wrong relationships without deleting anyone (SPEC §4.6). Each returns undoable ops. */

/**
 * Runs the ops to make sure they're legal before handing them back, so an impossible edit is
 * refused where it's chosen rather than when it's saved. Throws the same error the server would.
 */
function validated(graph: TreeGraph, ops: ChangeOp[]): ChangeOp[] {
  applyChangeSet(graph, ops, { now: '2000-01-01T00:00:00.000Z' });
  return ops;
}

/** Removes a child from one family. If that leaves a one-person family with no children, it goes too. */
export function planDetachParentLink(graph: TreeGraph, edgeId: string): ChangeOp[] {
  const index = indexGraph(graph);
  const edge = index.edge(edgeId);
  if (!edge) throw new PlanError('That link is no longer in this tree.', 'not_found');
  const union = index.union(edge.unionId);
  const ops: ChangeOp[] = [{ op: 'parentChild.delete', id: edge.id }];
  if (union && union.partnerBId === null && index.childEdgesOf(union.id).length === 1) ops.push({ op: 'union.delete', id: union.id });
  return ops;
}

/**
 * Detaches two partners. A partnership with children can't simply vanish (the children would
 * lose a parent); the partner who is leaving is removed from it instead, so the children stay
 * with the other.
 */
export function planDetachPartner(graph: TreeGraph, unionId: string, leavingPersonId: string): ChangeOp[] {
  const index = indexGraph(graph);
  const union = index.union(unionId);
  if (!union) throw new PlanError('That relationship is no longer in this tree.', 'not_found');
  if (union.partnerBId === null) throw new PlanError('This family has only one partner already.', 'invalid');
  const staying = union.partnerAId === leavingPersonId ? union.partnerBId : union.partnerAId;
  if (index.childEdgesOf(union.id).length === 0) return [{ op: 'union.delete', id: union.id }];
  return [{ op: 'union.update', id: union.id, patch: { partnerAId: staying, partnerBId: null } }];
}

/** Moves a child to a different family (re-parent), keeping the kind of link. */
export function planReparent(graph: TreeGraph, edgeId: string, targetUnionId: string): ChangeOp[] {
  const index = indexGraph(graph);
  const edge = index.edge(edgeId);
  if (!edge) throw new PlanError('That link is no longer in this tree.', 'not_found');
  if (!index.union(targetUnionId)) throw new PlanError('That family is no longer in this tree.', 'not_found');
  if (edge.unionId === targetUnionId) return [];
  const ops: ChangeOp[] = [{ op: 'parentChild.update', id: edge.id, patch: { unionId: targetUnionId } }];
  const source = index.union(edge.unionId);
  if (source && source.partnerBId === null && index.childEdgesOf(source.id).length === 1) ops.push({ op: 'union.delete', id: source.id });
  return validated(graph, ops);
}

/** The families a child can actually be moved into: the rest would make them their own ancestor. */
export function reparentTargets(graph: TreeGraph, edgeId: string): string[] {
  return graph.unions
    .filter((union) => {
      try {
        return planReparent(graph, edgeId, union.id).length > 0;
      } catch {
        return false;
      }
    })
    .map((union) => union.id);
}

export function planChangeKind(edgeId: string, kind: ParentChildKind): ChangeOp[] {
  return [{ op: 'parentChild.update', id: edgeId, patch: { kind } }];
}

export function planUpdateUnion(unionId: string, patch: UnionPatch): ChangeOp[] {
  return [{ op: 'union.update', id: unionId, patch }];
}

export function planSetFocus(personId: string | null): ChangeOp[] {
  return [{ op: 'tree.setFocus', personId }];
}
