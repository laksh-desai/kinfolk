import { displayName } from '../graph/displayName';
import { indexGraph, type GraphIndex } from '../graph/graphIndex';
import type { ChangeOp } from '../schemas/changeSet';
import type { TreeGraph } from '../schemas/graph';
import type { PersonPatch } from '../schemas/person';
import { PlanError } from './planState';

export type DeleteMode = 'remove' | 'placeholder' | 'with-descendants';

export interface DeletionImpact {
  name: string;
  /** Every relationship that changes, in plain words: "Wife of Vikram Sharma". */
  relationships: string[];
  descendants: Array<{ id: string; name: string }>;
  /** Children who would be left with no parent in the tree if this person were simply removed. */
  wouldOrphan: Array<{ id: string; name: string }>;
  isFocus: boolean;
  /** Modes the dialog should offer. */
  modes: DeleteMode[];
}

const RELATION_WORD = {
  child: { male: 'Son', female: 'Daughter', other: 'Child', unknown: 'Child' },
  parent: { male: 'Father', female: 'Mother', other: 'Parent', unknown: 'Parent' },
  partner: { male: 'Husband', female: 'Wife', other: 'Partner', unknown: 'Partner' },
} as const;

function descendantsOf(index: GraphIndex, personId: string): string[] {
  const seen = new Set<string>();
  const queue = [personId];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const { childId } of index.childrenOf(current)) {
      if (childId !== personId && !seen.has(childId)) {
        seen.add(childId);
        queue.push(childId);
      }
    }
  }
  return [...seen];
}

/** What deleting a person would change, named relationship by relationship (SPEC §3). */
export function deletionImpact(graph: TreeGraph, personId: string): DeletionImpact {
  const index = indexGraph(graph);
  const person = index.person(personId);
  if (!person) throw new PlanError('That person is no longer in this tree.', 'not_found');
  const name = (id: string) => displayName(index, id);
  const relationships: string[] = [];

  for (const { partnerId, union } of index.partnersOf(personId)) {
    if (partnerId) relationships.push(`${RELATION_WORD.partner[person.gender]} of ${name(partnerId)}${union.status === 'current' ? '' : ` (${union.status})`}`);
  }
  for (const link of index.parentsOf(personId)) {
    relationships.push(`${RELATION_WORD.child[person.gender]} of ${name(link.parentId)}${link.edge.kind === 'biological' ? '' : ` (${link.edge.kind})`}`);
  }
  const wouldOrphan: Array<{ id: string; name: string }> = [];
  for (const { childId, union, edge } of index.childrenOf(personId)) {
    const otherParent = union.partnerAId === personId ? union.partnerBId : union.partnerAId;
    relationships.push(`${RELATION_WORD.parent[person.gender]} of ${name(childId)}${otherParent ? ` (with ${name(otherParent)})` : ''}${edge.kind === 'biological' ? '' : ` (${edge.kind})`}`);
    if (!otherParent && index.parentEdgesOf(childId).length === 1) wouldOrphan.push({ id: childId, name: name(childId) });
  }
  const descendants = descendantsOf(index, personId).map((id) => ({ id, name: name(id) }));
  const modes: DeleteMode[] = [];
  if (wouldOrphan.length === 0) modes.push('remove');
  if (relationships.length > 0) modes.push('placeholder');
  if (descendants.length > 0) modes.push('with-descendants');
  if (modes.length === 0) modes.push('remove');
  return { name: name(personId), relationships, descendants, wouldOrphan, isFocus: graph.focusPersonId === personId, modes };
}

const CLEARED: PersonPatch = {
  firstName: '',
  lastName: null,
  maidenName: null,
  nickname: null,
  suffix: null,
  gender: 'unknown',
  lifeStatus: 'unknown',
  birthDate: null,
  deathDate: null,
  birthPlace: null,
  maritalStatus: null,
  email: null,
  phone: null,
  address: null,
  photoUrl: null,
  profession: null,
  notes: null,
  details: null,
  socials: null,
  isPlaceholder: true,
};

/**
 * Ops for deleting a person. Never orphans a subtree:
 * - `remove` refuses when a child would lose their only parent;
 * - `placeholder` keeps every relationship and clears the person's details;
 * - `with-descendants` removes the whole branch below them too.
 * `includePlanning` must be false for editors (they may not touch planning answers).
 */
export function planDeletePerson(
  graph: TreeGraph,
  personId: string,
  mode: DeleteMode,
  options: { includePlanning?: boolean; newFocusId?: string | null } = {},
): ChangeOp[] {
  const index = indexGraph(graph);
  if (!index.person(personId)) throw new PlanError('That person is no longer in this tree.', 'not_found');

  if (mode === 'placeholder') {
    return [{ op: 'person.update', id: personId, patch: options.includePlanning ? { ...CLEARED, planning: null } : CLEARED }];
  }

  const impact = deletionImpact(graph, personId);
  if (mode === 'remove' && impact.wouldOrphan.length > 0) {
    throw new PlanError(
      `Removing ${impact.name} would leave ${impact.wouldOrphan.map((child) => child.name).join(', ')} with no parent in the tree.`,
      'would_orphan',
    );
  }

  const doomed = new Set([personId, ...(mode === 'with-descendants' ? descendantsOf(index, personId) : [])]);
  const ops: ChangeOp[] = [];
  if (graph.focusPersonId && doomed.has(graph.focusPersonId)) {
    const fallback = options.newFocusId ?? graph.people.find((person) => !doomed.has(person.id))?.id ?? null;
    ops.push({ op: 'tree.setFocus', personId: fallback });
  }
  for (const edge of graph.parentChildren) {
    if (doomed.has(edge.childId)) ops.push({ op: 'parentChild.delete', id: edge.id });
  }
  for (const union of graph.unions) {
    const partners = union.partnerBId ? [union.partnerAId, union.partnerBId] : [union.partnerAId];
    const remaining = partners.filter((id) => !doomed.has(id));
    if (remaining.length === partners.length) continue;
    const childEdges = index.childEdgesOf(union.id).filter((edge) => !doomed.has(edge.childId));
    if (remaining.length === 0 || childEdges.length === 0) {
      // Nobody left to be a family, or a partnership with no children: nothing to keep.
      ops.push({ op: 'union.delete', id: union.id });
    } else {
      ops.push({ op: 'union.update', id: union.id, patch: { partnerAId: remaining[0] as string, partnerBId: null } });
    }
  }
  for (const id of doomed) ops.push({ op: 'person.delete', id });
  return ops;
}
