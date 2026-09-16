import { applyChangeSet } from '../graph/applyChangeSet';
import { displayName } from '../graph/displayName';
import { indexGraph } from '../graph/graphIndex';
import type { ChangeOp } from '../schemas/changeSet';
import type { TreeGraph } from '../schemas/graph';
import type { Person, PersonPatch } from '../schemas/person';
import { PlanError, type PlanContext } from './planState';

export const MERGE_FIELDS = [
  'firstName',
  'lastName',
  'maidenName',
  'nickname',
  'suffix',
  'gender',
  'lifeStatus',
  'birthDate',
  'deathDate',
  'birthPlace',
  'maritalStatus',
  'email',
  'phone',
  'address',
  'photoUrl',
  'profession',
  'notes',
  'details',
  'socials',
] as const;
export type MergeField = (typeof MERGE_FIELDS)[number];

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === '' || (typeof value === 'string' && value.trim() === '') || value === 'unknown';
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** Fields where both records have a different, non-empty value — the person must choose. */
export function mergeConflicts(keep: Person, other: Person): MergeField[] {
  return MERGE_FIELDS.filter((field) => !isEmpty(keep[field]) && !isEmpty(other[field]) && !same(keep[field], other[field]));
}

/** Whether `personId` is anywhere below `ancestorId` in the tree. */
function descendsFrom(index: ReturnType<typeof indexGraph>, personId: string, ancestorId: string): boolean {
  const seen = new Set<string>([personId]);
  const queue = [personId];
  while (queue.length > 0) {
    for (const link of index.parentsOf(queue.shift() as string)) {
      if (link.parentId === ancestorId) return true;
      if (!seen.has(link.parentId)) {
        seen.add(link.parentId);
        queue.push(link.parentId);
      }
    }
  }
  return false;
}

export interface MergePlan {
  ops: ChangeOp[];
  /** Links that could not be carried over, described plainly. */
  dropped: string[];
}

/**
 * Merges `otherId` into `keepId`. Empty fields on the kept record fill from the other; conflicts
 * follow `choices` (default: keep). Every relationship moves to the kept person, and exact
 * duplicates collapse. The kept person stops being a placeholder once named.
 */
export function planMerge(
  graph: TreeGraph,
  keepId: string,
  otherId: string,
  choices: Partial<Record<MergeField, 'keep' | 'other'>>,
  context: PlanContext,
): MergePlan {
  if (keepId === otherId) throw new PlanError('Choose two different people to merge.', 'same_person');
  const index = indexGraph(graph);
  const keep = index.person(keepId);
  const other = index.person(otherId);
  if (!keep || !other) throw new PlanError('That person is no longer in this tree.', 'not_found');
  // A parent and their child are two people however alike the records look — and merging them
  // would either make someone their own ancestor or quietly drop the link between them.
  const descendant = descendsFrom(index, otherId, keepId) ? other : descendsFrom(index, keepId, otherId) ? keep : null;
  if (descendant) {
    const ancestor = descendant === other ? keep : other;
    throw new PlanError(
      `${displayName(index, descendant.id)} descends from ${displayName(index, ancestor.id)}, so they can’t be the same person.`,
      'invalid',
    );
  }

  const patch: PersonPatch = {};
  for (const field of MERGE_FIELDS) {
    const useOther = choices[field] === 'other' || (isEmpty(keep[field]) && !isEmpty(other[field]));
    if (useOther && !same(keep[field], other[field])) (patch as Record<string, unknown>)[field] = other[field] ?? null;
  }
  const named = (patch.firstName ?? keep.firstName).trim() !== '';
  if (keep.isPlaceholder && named) patch.isPlaceholder = false;

  const ops: ChangeOp[] = [];
  const dropped: string[] = [];
  if (Object.keys(patch).length > 0) ops.push({ op: 'person.update', id: keepId, patch });

  // Parent links: move the other's child-edges to the kept person unless they'd duplicate.
  const keepEdges = index.parentEdgesOf(keepId);
  for (const edge of index.parentEdgesOf(otherId)) {
    if (keepEdges.some((existing) => existing.unionId === edge.unionId)) {
      ops.push({ op: 'parentChild.delete', id: edge.id });
    } else if (keepEdges.some((existing) => existing.kind === edge.kind)) {
      ops.push({ op: 'parentChild.delete', id: edge.id });
      const union = index.union(edge.unionId);
      const parents = union ? index.partnersOfUnion(union).map((id) => displayName(index, id)).join(' and ') : 'another family';
      const kindWord = edge.kind === 'biological' ? 'birth' : edge.kind;
      dropped.push(`${parents} won’t be linked as ${kindWord} parents: a person can have only one set of ${kindWord} parents. Add them again under Relationships as another kind if that’s right.`);
    } else {
      ops.push({ op: 'parentChild.delete', id: edge.id });
      ops.push({ op: 'parentChild.create', edge: { id: context.newId(), unionId: edge.unionId, childId: keepId, kind: edge.kind, createdAt: edge.createdAt } });
    }
  }

  // Unions: re-point the other's partnerships; a couple with themselves becomes a one-parent family.
  for (const union of index.unionsOf(otherId)) {
    const partner = union.partnerAId === otherId ? union.partnerBId : union.partnerAId;
    if (partner === keepId) {
      ops.push({ op: 'union.update', id: union.id, patch: { partnerAId: keepId, partnerBId: null } });
      continue;
    }
    const duplicate = index.unionsOf(keepId).find((existing) => (existing.partnerAId === keepId ? existing.partnerBId : existing.partnerAId) === partner);
    if (duplicate && partner !== null) {
      const alreadyThere = new Set(index.childEdgesOf(duplicate.id).map((edge) => edge.childId));
      for (const edge of index.childEdgesOf(union.id)) {
        if (alreadyThere.has(edge.childId)) ops.push({ op: 'parentChild.delete', id: edge.id });
        else ops.push({ op: 'parentChild.update', id: edge.id, patch: { unionId: duplicate.id } });
      }
      ops.push({ op: 'union.delete', id: union.id });
      continue;
    }
    ops.push({
      op: 'union.update',
      id: union.id,
      patch: union.partnerAId === otherId ? { partnerAId: keepId } : { partnerBId: keepId },
    });
  }

  if (graph.focusPersonId === otherId) ops.push({ op: 'tree.setFocus', personId: keepId });
  ops.push({ op: 'person.delete', id: otherId });
  // Run them before handing them back: two people on one line of descent can't be one person, and
  // the merge screen should say so while it's being set up, not when Merge is pressed.
  applyChangeSet(graph, ops, { now: '2000-01-01T00:00:00.000Z' });
  return { ops, dropped };
}
