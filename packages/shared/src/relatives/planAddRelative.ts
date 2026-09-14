import { LINEAL_KINDS, type ParentChildKind } from '../schemas/parentChild';
import type { ChangeOp, PersonCreateInput } from '../schemas/changeSet';
import type { TreeGraph } from '../schemas/graph';
import type { Gender } from '../schemas/person';
import type { UnionStatus, UnionType } from '../schemas/union';
import { PlanError, PlanState, type PlanContext } from './planState';

export const RELATION_KEYS = [
  'parent', 'mother', 'father',
  'sibling', 'brother', 'sister', 'half-sibling', 'step-sibling',
  'partner', 'spouse', 'former-spouse', 'unmarried-partner',
  'child', 'son', 'daughter', 'step-child', 'adopted-child',
  'grandparent', 'grandchild', 'great-grandparent', 'great-grandchild',
  'aunt-uncle', 'niece-nephew', 'cousin',
  'parent-in-law', 'sibling-in-law', 'child-in-law',
] as const;
export type RelationKey = (typeof RELATION_KEYS)[number];

export interface RelationSpec {
  key: RelationKey;
  /** Shown in the picker: "Mother", "Aunt or uncle". */
  label: string;
  group: 'Parents' | 'Siblings' | 'Partners' | 'Children' | 'Grandparents and grandchildren' | 'Extended family' | 'In-laws';
  /** Gender the new person gets by default. */
  gender?: Gender;
  /** The four primitives from SPEC §4.1, shown first. */
  primitive?: boolean;
}

export const RELATIONS: readonly RelationSpec[] = [
  { key: 'parent', label: 'Parent', group: 'Parents', primitive: true },
  { key: 'mother', label: 'Mother', group: 'Parents', gender: 'female' },
  { key: 'father', label: 'Father', group: 'Parents', gender: 'male' },
  { key: 'sibling', label: 'Sibling', group: 'Siblings', primitive: true },
  { key: 'brother', label: 'Brother', group: 'Siblings', gender: 'male' },
  { key: 'sister', label: 'Sister', group: 'Siblings', gender: 'female' },
  { key: 'half-sibling', label: 'Half-sibling', group: 'Siblings' },
  { key: 'step-sibling', label: 'Step-sibling', group: 'Siblings' },
  { key: 'partner', label: 'Partner or spouse', group: 'Partners', primitive: true },
  { key: 'spouse', label: 'Spouse', group: 'Partners' },
  { key: 'former-spouse', label: 'Former spouse', group: 'Partners' },
  { key: 'unmarried-partner', label: 'Partner (unmarried)', group: 'Partners' },
  { key: 'child', label: 'Child', group: 'Children', primitive: true },
  { key: 'son', label: 'Son', group: 'Children', gender: 'male' },
  { key: 'daughter', label: 'Daughter', group: 'Children', gender: 'female' },
  { key: 'step-child', label: 'Step-child', group: 'Children' },
  { key: 'adopted-child', label: 'Adopted child', group: 'Children' },
  { key: 'grandparent', label: 'Grandparent', group: 'Grandparents and grandchildren' },
  { key: 'grandchild', label: 'Grandchild', group: 'Grandparents and grandchildren' },
  { key: 'great-grandparent', label: 'Great-grandparent', group: 'Grandparents and grandchildren' },
  { key: 'great-grandchild', label: 'Great-grandchild', group: 'Grandparents and grandchildren' },
  { key: 'aunt-uncle', label: 'Aunt or uncle', group: 'Extended family' },
  { key: 'niece-nephew', label: 'Niece or nephew', group: 'Extended family' },
  { key: 'cousin', label: 'Cousin', group: 'Extended family' },
  { key: 'parent-in-law', label: 'Parent-in-law', group: 'In-laws' },
  { key: 'sibling-in-law', label: 'Sibling-in-law', group: 'In-laws' },
  { key: 'child-in-law', label: 'Child-in-law', group: 'In-laws' },
];

/** Choose this in `Via` to connect through a new unnamed person even when candidates exist. */
export const NEW_PERSON = 'new';
/** For a child: attach to the anchor alone (a one-parent family) rather than an existing couple. */
export const SOLO_UNION = 'solo';

/**
 * Existing people the user chose to connect through. Missing → the obvious existing candidate,
 * or a placeholder when there is none. NEW_PERSON → always a placeholder.
 */
export interface Via {
  parentId?: string | null;
  grandparentId?: string | null;
  siblingId?: string | null;
  childId?: string | null;
  grandchildId?: string | null;
  partnerId?: string | null;
  auntUncleId?: string | null;
  sharedParentId?: string | null;
  /** For a child: which of the anchor's unions they belong to. */
  unionId?: string | null;
}

export interface AddRelativeRequest {
  anchorId: string;
  relation: RelationKey;
  person: PersonCreateInput;
  via?: Via;
  /** Parent/child link kind. Defaults to biological (adopted for "adopted-child"). */
  kind?: ParentChildKind;
  /** Sibling-in-law: the partner's sibling (default) or the sibling's partner. */
  siblingInLawVia?: 'partner' | 'sibling';
}

export interface AddRelativePlan {
  ops: ChangeOp[];
  personId: string;
  placeholderIds: string[];
  /** One plain sentence saying what was added, including any placeholders. */
  summary: string;
}

const PARTNER_UNION: Partial<Record<RelationKey, { type: UnionType; status: UnionStatus }>> = {
  partner: { type: 'partnership', status: 'current' },
  spouse: { type: 'marriage', status: 'current' },
  'former-spouse': { type: 'marriage', status: 'divorced' },
  'unmarried-partner': { type: 'partnership', status: 'current' },
};

function linealParentUnion(state: PlanState, childId: string, kind: ParentChildKind) {
  const edge = state.index.parentEdgesOf(childId).find((candidate) => candidate.kind === kind);
  return edge ? state.index.union(edge.unionId) : undefined;
}

/** Links `parentId` as a parent of `childId`, joining an existing one-parent family where possible. */
function attachParent(state: PlanState, childId: string, parentId: string, kind: ParentChildKind): void {
  const existing = linealParentUnion(state, childId, kind);
  if (existing) {
    if (existing.partnerBId !== null) {
      throw new PlanError(
        `${state.ref(childId)} already has two ${kind === 'biological' ? 'birth' : kind} parents. Add this person as an adoptive, step, foster, or guardian parent instead.`,
        'two_parents',
      );
    }
    state.push({ op: 'union.update', id: existing.id, patch: { partnerBId: parentId, type: existing.type === 'unknown' ? 'partnership' : existing.type } });
    return;
  }
  state.addEdge(state.addUnion(parentId, null), childId, kind);
}

/** Adds `childId` under `parentId`: into the given union, or the parent's one-parent family, or a new one. */
function attachChild(state: PlanState, parentId: string, childId: string, kind: ParentChildKind, unionId?: string | null): void {
  if (unionId === NEW_PERSON) {
    const partner = state.addPlaceholder('partner', parentId);
    state.addEdge(state.addUnion(parentId, partner, 'unknown', 'current'), childId, kind);
    return;
  }
  if (unionId && unionId !== SOLO_UNION) {
    const union = state.index.union(unionId);
    if (!union || (union.partnerAId !== parentId && union.partnerBId !== parentId)) {
      throw new PlanError('That family doesn’t include this person.', 'invalid');
    }
    state.addEdge(union.id, childId, kind);
    return;
  }
  const solo = state.index.unionsOf(parentId).find((union) => union.partnerBId === null && union.partnerAId === parentId);
  state.addEdge(solo ? solo.id : state.addUnion(parentId, null), childId, kind);
}

function ensureParent(state: PlanState, childId: string, chosen?: string | null): string {
  const parents = state.index.parentsOf(childId).filter((link) => LINEAL_KINDS.has(link.edge.kind)).map((link) => link.parentId);
  if (chosen && chosen !== NEW_PERSON) {
    if (!parents.includes(chosen)) throw new PlanError('That person isn’t a parent here.', 'invalid');
    return chosen;
  }
  if (parents[0] && chosen !== NEW_PERSON) return parents[0];
  const placeholder = state.addPlaceholder('parent', childId);
  attachParent(state, childId, placeholder, 'biological');
  return placeholder;
}

function ensureChild(state: PlanState, parentId: string, chosen?: string | null): string {
  const children = state.index.childrenOf(parentId).map((link) => link.childId);
  if (chosen && chosen !== NEW_PERSON) {
    if (!children.includes(chosen)) throw new PlanError('That person isn’t a child here.', 'invalid');
    return chosen;
  }
  if (children[0] && chosen !== NEW_PERSON) return children[0];
  const placeholder = state.addPlaceholder('child', parentId);
  attachChild(state, parentId, placeholder, 'biological');
  return placeholder;
}

function fullSiblingsOf(state: PlanState, personId: string): string[] {
  const union = linealParentUnion(state, personId, 'biological');
  if (!union) return [];
  return state.index.childEdgesOf(union.id).map((edge) => edge.childId).filter((id) => id !== personId);
}

function addFullSibling(state: PlanState, personId: string, siblingId: string): void {
  let union = linealParentUnion(state, personId, 'biological');
  if (!union) {
    const placeholder = state.addPlaceholder('parent', personId);
    attachParent(state, personId, placeholder, 'biological');
    union = linealParentUnion(state, personId, 'biological');
  }
  // Checked by the branch above; the working graph always has the union at this point.
  state.addEdge((union as { id: string }).id, siblingId, 'biological');
}

function ensureSibling(state: PlanState, personId: string, chosen?: string | null): string {
  const allSiblings = state.index
    .parentsOf(personId)
    .flatMap((link) => state.index.childEdgesOf(link.union.id).map((edge) => edge.childId))
    .filter((id) => id !== personId);
  if (chosen && chosen !== NEW_PERSON) {
    if (!allSiblings.includes(chosen)) throw new PlanError('That person isn’t a sibling here.', 'invalid');
    return chosen;
  }
  const existing = fullSiblingsOf(state, personId)[0] ?? allSiblings[0];
  if (existing && chosen !== NEW_PERSON) return existing;
  // A sibling needs a shared parental family; create the unnamed parent first so the summary
  // reads in the order the connection runs.
  if (!linealParentUnion(state, personId, 'biological')) {
    attachParent(state, personId, state.addPlaceholder('parent', personId), 'biological');
  }
  const placeholder = state.addPlaceholder('sibling', personId);
  addFullSibling(state, personId, placeholder);
  return placeholder;
}

function ensurePartner(state: PlanState, personId: string, chosen?: string | null): string {
  const partners = state.index
    .partnersOf(personId)
    .filter((link) => link.partnerId !== null)
    .sort((a, b) => Number(a.union.status !== 'current') - Number(b.union.status !== 'current'));
  if (chosen && chosen !== NEW_PERSON) {
    if (!partners.some((link) => link.partnerId === chosen)) throw new PlanError('That person isn’t a partner here.', 'invalid');
    return chosen;
  }
  const existing = partners[0]?.partnerId;
  if (existing && chosen !== NEW_PERSON) return existing;
  const placeholder = state.addPlaceholder('partner', personId);
  state.addUnion(personId, placeholder, 'unknown', 'current');
  return placeholder;
}

const RELATION_WORDS: Record<RelationKey, [string, string, string]> = {
  parent: ['father', 'mother', 'parent'],
  mother: ['mother', 'mother', 'mother'],
  father: ['father', 'father', 'father'],
  sibling: ['brother', 'sister', 'sibling'],
  brother: ['brother', 'brother', 'brother'],
  sister: ['sister', 'sister', 'sister'],
  'half-sibling': ['half-brother', 'half-sister', 'half-sibling'],
  'step-sibling': ['step-brother', 'step-sister', 'step-sibling'],
  partner: ['partner', 'partner', 'partner'],
  spouse: ['husband', 'wife', 'spouse'],
  'former-spouse': ['former husband', 'former wife', 'former spouse'],
  'unmarried-partner': ['partner', 'partner', 'partner'],
  child: ['son', 'daughter', 'child'],
  son: ['son', 'son', 'son'],
  daughter: ['daughter', 'daughter', 'daughter'],
  'step-child': ['step-son', 'step-daughter', 'step-child'],
  'adopted-child': ['adopted son', 'adopted daughter', 'adopted child'],
  grandparent: ['grandfather', 'grandmother', 'grandparent'],
  grandchild: ['grandson', 'granddaughter', 'grandchild'],
  'great-grandparent': ['great-grandfather', 'great-grandmother', 'great-grandparent'],
  'great-grandchild': ['great-grandson', 'great-granddaughter', 'great-grandchild'],
  'aunt-uncle': ['uncle', 'aunt', 'aunt or uncle'],
  'niece-nephew': ['nephew', 'niece', 'niece or nephew'],
  cousin: ['cousin', 'cousin', 'cousin'],
  'parent-in-law': ['father-in-law', 'mother-in-law', 'parent-in-law'],
  'sibling-in-law': ['brother-in-law', 'sister-in-law', 'sibling-in-law'],
  'child-in-law': ['son-in-law', 'daughter-in-law', 'child-in-law'],
};

function wordFor(relation: RelationKey, gender: Gender): string {
  const [male, female, neutral] = RELATION_WORDS[relation];
  return gender === 'male' ? male : gender === 'female' ? female : neutral;
}

function joinPhrases(phrases: string[]): string {
  if (phrases.length <= 1) return phrases.join('');
  return `${phrases.slice(0, -1).join(', ')} and ${phrases[phrases.length - 1]}`;
}

function possessive(name: string): string {
  return name.endsWith('s') ? `${name}’` : `${name}’s`;
}

/**
 * Resolves "add X as the anchor's <relation>" into graph ops (SPEC §4.2). Uses existing people
 * where the caller names them in `via`, or where there is exactly one obvious candidate.
 * Otherwise it creates unnamed placeholders and says so in the summary. Throws PlanError when
 * the request can't be satisfied (e.g. a third birth parent).
 */
export function planAddRelative(graph: TreeGraph, request: AddRelativeRequest, context: PlanContext): AddRelativePlan {
  const state = new PlanState(graph, context);
  const { anchorId, relation, via = {} } = request;
  state.person(anchorId);
  const anchorName = state.ref(anchorId);
  const newId = state.addPerson(request.person);
  const kind = request.kind ?? (relation === 'adopted-child' ? 'adopted' : 'biological');

  switch (relation) {
    case 'parent':
    case 'mother':
    case 'father':
      attachParent(state, anchorId, newId, kind);
      break;
    case 'child':
    case 'son':
    case 'daughter':
    case 'adopted-child':
      attachChild(state, anchorId, newId, kind, via.unionId);
      break;
    case 'step-child':
      attachChild(state, ensurePartner(state, anchorId, via.partnerId), newId, 'biological');
      break;
    case 'partner':
    case 'spouse':
    case 'former-spouse':
    case 'unmarried-partner': {
      const shape = PARTNER_UNION[relation] ?? { type: 'unknown', status: 'current' };
      state.addUnion(anchorId, newId, shape.type, shape.status);
      break;
    }
    case 'sibling':
    case 'brother':
    case 'sister':
      addFullSibling(state, anchorId, newId);
      break;
    case 'half-sibling': {
      const shared = ensureParent(state, anchorId, via.sharedParentId);
      state.addEdge(state.addUnion(shared, null), newId, 'biological');
      break;
    }
    case 'step-sibling': {
      const parent = ensureParent(state, anchorId, via.parentId);
      const stepParents = state.index
        .partnersOf(parent)
        .flatMap((link) => (link.partnerId && !state.index.parentsOf(anchorId).some((p) => p.parentId === link.partnerId) ? [link.partnerId] : []));
      if (via.partnerId && via.partnerId !== NEW_PERSON && !stepParents.includes(via.partnerId)) {
        throw new PlanError('That person isn’t a step-parent here.', 'invalid');
      }
      let stepParent = via.partnerId === NEW_PERSON ? undefined : (via.partnerId ?? stepParents[0]);
      if (!stepParent) {
        stepParent = state.addPlaceholder('partner', parent);
        state.addUnion(parent, stepParent, 'unknown', 'current');
      }
      state.addEdge(state.addUnion(stepParent, null), newId, 'biological');
      break;
    }
    case 'grandparent':
      attachParent(state, ensureParent(state, anchorId, via.parentId), newId, 'biological');
      break;
    case 'great-grandparent': {
      const parent = ensureParent(state, anchorId, via.parentId);
      attachParent(state, ensureParent(state, parent, via.grandparentId), newId, 'biological');
      break;
    }
    case 'grandchild':
      attachChild(state, ensureChild(state, anchorId, via.childId), newId, 'biological');
      break;
    case 'great-grandchild': {
      const child = ensureChild(state, anchorId, via.childId);
      attachChild(state, ensureChild(state, child, via.grandchildId), newId, 'biological');
      break;
    }
    case 'aunt-uncle':
      addFullSibling(state, ensureParent(state, anchorId, via.parentId), newId);
      break;
    case 'niece-nephew':
      attachChild(state, ensureSibling(state, anchorId, via.siblingId), newId, 'biological');
      break;
    case 'cousin': {
      const parent = ensureParent(state, anchorId, via.parentId);
      attachChild(state, ensureSibling(state, parent, via.auntUncleId), newId, 'biological');
      break;
    }
    case 'parent-in-law':
      attachParent(state, ensurePartner(state, anchorId, via.partnerId), newId, request.kind ?? 'biological');
      break;
    case 'sibling-in-law':
      if (request.siblingInLawVia === 'sibling') state.addUnion(ensureSibling(state, anchorId, via.siblingId), newId, 'marriage', 'current');
      else addFullSibling(state, ensurePartner(state, anchorId, via.partnerId), newId);
      break;
    case 'child-in-law':
      state.addUnion(ensureChild(state, anchorId, via.childId), newId, 'marriage', 'current');
      break;
  }

  const person = request.person;
  const newName = person.firstName.trim() || 'Someone';
  const pronoun = person.gender === 'female' ? 'her' : person.gender === 'male' ? 'him' : 'them';
  const added = `Added ${newName} as ${possessive(anchorName)} ${wordFor(relation, person.gender)}.`;
  const phrases = state.placeholders.map((entry) => entry.phrase);
  const summary = phrases.length
    ? `${added} To connect ${pronoun} we also added ${joinPhrases(phrases)} — you can name ${phrases.length === 1 ? 'it' : 'them'} anytime.`
    : added;

  return { ops: state.ops, personId: newId, placeholderIds: state.placeholders.map((entry) => entry.id), summary };
}

export interface ConnectionOption {
  id: string;
  /** Plain words: "Vikram Sharma", or "With Priya Sharma" for a family. */
  label: string;
}

export interface ConnectionStep {
  key: keyof Via;
  question: string;
  options: ConnectionOption[];
  /** Whether "someone not in the tree yet" (an unnamed placeholder) is an allowed answer. */
  allowsNew: boolean;
}

export interface ConnectionChoices {
  steps: ConnectionStep[];
  /** The anchor already has two birth parents: the UI must ask which kind of parent this is. */
  needsParentKind: boolean;
}

/**
 * The questions to ask before planning, given the answers so far: "Which of Ravi’s parents?",
 * "Which aunt or uncle?". Steps with no existing options are omitted; the planner then creates
 * a placeholder.
 */
export function connectionSteps(graph: TreeGraph, anchorId: string, relation: RelationKey, via: Via = {}): ConnectionChoices {
  const state = new PlanState(graph, { newId: () => 'unused' });
  const name = (id: string) => state.ref(id);
  const index = state.index;
  const fullName = (id: string) => {
    const person = index.person(id);
    return person ? [person.firstName, person.lastName].filter(Boolean).join(' ') || name(id) : id;
  };
  const people = (ids: string[]) => [...new Set(ids)].map((id) => ({ id, label: fullName(id) }));
  const parentsOf = (id: string) => index.parentsOf(id).filter((link) => LINEAL_KINDS.has(link.edge.kind)).map((link) => link.parentId);
  const childrenOf = (id: string) => index.childrenOf(id).map((link) => link.childId);
  const partnersOf = (id: string) => index.partnersOf(id).flatMap((link) => (link.partnerId ? [link.partnerId] : []));
  const siblingsOf = (id: string) =>
    index.parentsOf(id).flatMap((link) => index.childEdgesOf(link.union.id).map((edge) => edge.childId)).filter((other) => other !== id);
  const anchor = name(anchorId);
  const steps: ConnectionStep[] = [];
  const step = (key: keyof Via, question: string, ids: string[], allowsNew = true) => {
    if (ids.length > 0) steps.push({ key, question, options: people(ids), allowsNew });
  };

  const bioParentUnion = linealParentUnion(state, anchorId, 'biological');
  const needsParentKind = ['parent', 'mother', 'father'].includes(relation) && Boolean(bioParentUnion?.partnerBId);

  switch (relation) {
    case 'child':
    case 'son':
    case 'daughter':
    case 'adopted-child': {
      const unions = index.unionsOf(anchorId);
      if (unions.length > 0) {
        steps.push({
          key: 'unionId',
          question: `Who is the child’s other parent?`,
          options: [
            ...unions.map((union) => {
              const other = union.partnerAId === anchorId ? union.partnerBId : union.partnerAId;
              return { id: union.id, label: other ? `With ${fullName(other)}` : `${anchor} on their own` };
            }),
            ...(unions.some((union) => union.partnerBId === null) ? [] : [{ id: SOLO_UNION, label: `${anchor} on their own (other parent not recorded)` }]),
          ],
          allowsNew: true,
        });
      }
      break;
    }
    case 'step-child':
      step('partnerId', `Which of ${anchor}’s partners is the child’s parent?`, partnersOf(anchorId));
      break;
    case 'half-sibling':
      step('sharedParentId', `Which parent do they share with ${anchor}?`, parentsOf(anchorId));
      break;
    case 'step-sibling':
    case 'grandparent':
    case 'aunt-uncle':
    case 'cousin':
    case 'great-grandparent':
      step('parentId', `On which parent’s side?`, parentsOf(anchorId));
      if (relation === 'cousin' && via.parentId) step('auntUncleId', `Whose child are they?`, siblingsOf(via.parentId));
      if (relation === 'great-grandparent' && via.parentId) step('grandparentId', `Through which grandparent?`, parentsOf(via.parentId));
      break;
    case 'grandchild':
    case 'great-grandchild':
    case 'child-in-law':
      step('childId', relation === 'child-in-law' ? `Whose partner are they?` : `Through which child?`, childrenOf(anchorId));
      if (relation === 'great-grandchild' && via.childId) step('grandchildId', `Through which grandchild?`, childrenOf(via.childId));
      break;
    case 'niece-nephew':
      step('siblingId', `Whose child are they?`, siblingsOf(anchorId));
      break;
    case 'parent-in-law':
      step('partnerId', `Which partner’s parent?`, partnersOf(anchorId));
      break;
    case 'sibling-in-law':
      step('partnerId', `Which partner’s sibling?`, partnersOf(anchorId));
      step('siblingId', `Whose partner are they?`, siblingsOf(anchorId));
      break;
    default:
      break;
  }
  return { steps, needsParentKind };
}

/** Adds someone with no relationships yet (SPEC §4.3: connect them later). */
export function planAddDetached(graph: TreeGraph, person: PersonCreateInput, context: PlanContext): AddRelativePlan {
  const state = new PlanState(graph, context);
  state.addPerson(person);
  if (!graph.focusPersonId) state.push({ op: 'tree.setFocus', personId: person.id });
  const name = person.firstName.trim() || 'Someone';
  const summary = graph.people.length === 0 ? `Added ${name} as the first person in this tree.` : `Added ${name} to the tree. Connect them to someone whenever you’re ready.`;
  return { ops: state.ops, personId: person.id, placeholderIds: [], summary };
}
