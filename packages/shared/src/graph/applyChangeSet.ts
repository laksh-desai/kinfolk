import type { ChangeOp } from '../schemas/changeSet';
import type { TreeGraph } from '../schemas/graph';
import type { ParentChild, ParentChildKind } from '../schemas/parentChild';
import { personConsistencyIssues, type Person } from '../schemas/person';
import type { Union } from '../schemas/union';
import { fullName } from './displayName';

export type GraphErrorCode =
  | 'not_found'
  | 'duplicate_id'
  | 'invalid_person'
  | 'self_partner'
  | 'person_has_relationships'
  | 'person_is_focus'
  | 'union_has_children'
  | 'child_is_partner'
  | 'duplicate_parent_link'
  | 'duplicate_parent_kind'
  | 'cycle';

/** A change that would break the family graph. `message` is written for the person using the app. */
export class GraphValidationError extends Error {
  constructor(
    message: string,
    public readonly code: GraphErrorCode,
    public readonly opIndex: number,
    public readonly field?: string,
  ) {
    super(message);
    this.name = 'GraphValidationError';
  }
}

export interface ApplyChangeSetOptions {
  /** Timestamp for records created without one. Each op gets +index ms so order is kept. */
  now: string;
}

export interface ApplyChangeSetResult {
  graph: TreeGraph;
  /** Ops that undo this change set exactly, in the order they must run. */
  inverse: ChangeOp[];
  /** The ops as applied: defaults filled, createdAt set, implied field changes included. */
  applied: ChangeOp[];
}

const KIND_WORDS: Record<ParentChildKind, string> = {
  biological: 'biological',
  adopted: 'adoptive',
  step: 'step-',
  foster: 'foster',
  guardian: 'guardian',
};

/** Mutable working copy with the adjacency maps the invariant checks need, updated in place. */
class WorkingGraph {
  readonly people: Map<string, Person>;
  readonly unions: Map<string, Union>;
  readonly edges: Map<string, ParentChild>;
  focusPersonId: string | null;
  private readonly unionsByPartner = new Map<string, Set<string>>();
  private readonly edgesByChild = new Map<string, Set<string>>();
  private readonly edgesByUnion = new Map<string, Set<string>>();

  constructor(graph: TreeGraph) {
    this.people = new Map(graph.people.map((person) => [person.id, person]));
    this.unions = new Map();
    this.edges = new Map();
    this.focusPersonId = graph.focusPersonId;
    for (const union of graph.unions) this.putUnion(union);
    for (const edge of graph.parentChildren) this.putEdge(edge);
  }

  private static add(map: Map<string, Set<string>>, key: string, value: string) {
    const set = map.get(key);
    if (set) set.add(value);
    else map.set(key, new Set([value]));
  }

  private static remove(map: Map<string, Set<string>>, key: string, value: string) {
    map.get(key)?.delete(value);
  }

  putUnion(union: Union) {
    const previous = this.unions.get(union.id);
    if (previous) this.removeUnion(previous.id);
    this.unions.set(union.id, union);
    WorkingGraph.add(this.unionsByPartner, union.partnerAId, union.id);
    if (union.partnerBId) WorkingGraph.add(this.unionsByPartner, union.partnerBId, union.id);
  }

  removeUnion(id: string) {
    const union = this.unions.get(id);
    if (!union) return;
    WorkingGraph.remove(this.unionsByPartner, union.partnerAId, id);
    if (union.partnerBId) WorkingGraph.remove(this.unionsByPartner, union.partnerBId, id);
    this.unions.delete(id);
  }

  putEdge(edge: ParentChild) {
    const previous = this.edges.get(edge.id);
    if (previous) this.removeEdge(previous.id);
    this.edges.set(edge.id, edge);
    WorkingGraph.add(this.edgesByChild, edge.childId, edge.id);
    WorkingGraph.add(this.edgesByUnion, edge.unionId, edge.id);
  }

  removeEdge(id: string) {
    const edge = this.edges.get(id);
    if (!edge) return;
    WorkingGraph.remove(this.edgesByChild, edge.childId, id);
    WorkingGraph.remove(this.edgesByUnion, edge.unionId, id);
    this.edges.delete(id);
  }

  unionIdsOf(personId: string): string[] {
    return [...(this.unionsByPartner.get(personId) ?? [])];
  }

  edgesOfChild(childId: string): ParentChild[] {
    return [...(this.edgesByChild.get(childId) ?? [])].flatMap((id) => this.edges.get(id) ?? []);
  }

  edgesOfUnion(unionId: string): ParentChild[] {
    return [...(this.edgesByUnion.get(unionId) ?? [])].flatMap((id) => this.edges.get(id) ?? []);
  }

  /** True when `candidate` is `ancestorId` or descends from them. */
  descendsFrom(candidate: string, ancestorId: string): boolean {
    if (candidate === ancestorId) return true;
    const seen = new Set<string>([ancestorId]);
    const queue = [ancestorId];
    while (queue.length > 0) {
      const current = queue.pop() as string;
      for (const unionId of this.unionsByPartner.get(current) ?? []) {
        for (const edgeId of this.edgesByUnion.get(unionId) ?? []) {
          const childId = this.edges.get(edgeId)?.childId;
          if (!childId || seen.has(childId)) continue;
          if (childId === candidate) return true;
          seen.add(childId);
          queue.push(childId);
        }
      }
    }
    return false;
  }

  name(personId: string): string {
    const person = this.people.get(personId);
    if (!person) return 'that person';
    return fullName(person) || 'this unnamed person';
  }

  toGraph(): TreeGraph {
    return {
      people: [...this.people.values()],
      unions: [...this.unions.values()],
      parentChildren: [...this.edges.values()],
      focusPersonId: this.focusPersonId,
    };
  }
}

function partnersOf(union: Pick<Union, 'partnerAId' | 'partnerBId'>): string[] {
  return union.partnerBId ? [union.partnerAId, union.partnerBId] : [union.partnerAId];
}

/** The keys of `patch` with the values they had in `before` (null where absent). */
function previousValues<T extends object>(before: T, patch: Partial<T>): Partial<T> {
  const previous: Partial<T> = {};
  for (const key of Object.keys(patch) as Array<keyof T>) {
    const value = before[key];
    previous[key] = (value === undefined ? null : value) as T[keyof T];
  }
  return previous;
}

function definedOnly<T extends object>(patch: T): T {
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as T;
}

/**
 * Applies an ordered list of graph operations, enforcing every family-graph invariant:
 * - children hang off unions;
 * - at most one parent link per (child, union) and per (child, kind);
 * - nobody is their own ancestor;
 * - nothing is left referencing a deleted record.
 *
 * Pure: the same code gives the client its optimistic state and the server its authoritative
 * check. Throws GraphValidationError on the first violation; the input graph is never mutated.
 */
export function applyChangeSet(graph: TreeGraph, ops: readonly ChangeOp[], options: ApplyChangeSetOptions): ApplyChangeSetResult {
  const g = new WorkingGraph(graph);
  const inverse: ChangeOp[] = [];
  const applied: ChangeOp[] = [];
  const baseMs = Date.parse(options.now);

  ops.forEach((op, index) => {
    const fail = (message: string, code: GraphErrorCode, field?: string): never => {
      throw new GraphValidationError(message, code, index, field);
    };
    const createdAt = (given: string | undefined) => given ?? new Date(baseMs + index).toISOString();

    const checkChildOfUnion = (childId: string, union: Union, kind: ParentChildKind, ignoreEdgeId?: string) => {
      const child = g.people.get(childId) ?? fail('That child is no longer in this tree.', 'not_found');
      const childName = g.name(child.id);
      if (partnersOf(union).includes(childId)) {
        fail(`${childName} can’t be their own parent.`, 'child_is_partner');
      }
      for (const existing of g.edgesOfChild(childId)) {
        if (existing.id === ignoreEdgeId) continue;
        if (existing.unionId === union.id) fail(`${childName} is already a child of that family.`, 'duplicate_parent_link');
        if (existing.kind === kind) {
          fail(
            `${childName} already has ${KIND_WORDS[kind]}${kind === 'step' ? '' : ' '}parents. Choose another kind, such as adopted, step, or foster.`,
            'duplicate_parent_kind',
            'kind',
          );
        }
      }
      for (const partnerId of partnersOf(union)) {
        if (g.descendsFrom(partnerId, childId)) {
          fail(
            `That would make ${childName} their own ancestor, because ${g.name(partnerId)} already descends from ${childName}.`,
            'cycle',
          );
        }
      }
    };

    const checkPartners = (union: Pick<Union, 'partnerAId' | 'partnerBId'>) => {
      if (!g.people.has(union.partnerAId)) fail('That partner is no longer in this tree.', 'not_found', 'partnerAId');
      if (union.partnerBId !== null && !g.people.has(union.partnerBId)) {
        fail('That partner is no longer in this tree.', 'not_found', 'partnerBId');
      }
      if (union.partnerBId === union.partnerAId) fail('Someone can’t be their own partner.', 'self_partner', 'partnerBId');
    };

    switch (op.op) {
      case 'person.create': {
        if (g.people.has(op.person.id)) fail('That person is already in this tree.', 'duplicate_id');
        const person: Person = { ...op.person, createdAt: createdAt(op.person.createdAt) };
        const issues = Object.entries(personConsistencyIssues(person));
        if (issues[0]) fail(issues[0][1], 'invalid_person', issues[0][0]);
        g.people.set(person.id, person);
        applied.push({ ...op, person });
        inverse.unshift({ op: 'person.delete', id: person.id });
        break;
      }
      case 'person.update': {
        const before = g.people.get(op.id) ?? fail('That person is no longer in this tree.', 'not_found');
        const patch = definedOnly({ ...op.patch });
        // Naming a placeholder turns it into a real person (SPEC §4.2).
        if (before.isPlaceholder && patch.isPlaceholder === undefined && patch.firstName?.trim()) {
          patch.isPlaceholder = false;
        }
        const after: Person = { ...before, ...patch };
        const issues = Object.entries(personConsistencyIssues(after));
        if (issues[0]) fail(issues[0][1], 'invalid_person', issues[0][0]);
        g.people.set(after.id, after);
        applied.push({ op: 'person.update', id: op.id, patch });
        inverse.unshift({ op: 'person.update', id: op.id, patch: previousValues(before, patch) });
        break;
      }
      case 'person.delete': {
        const before = g.people.get(op.id) ?? fail('That person is no longer in this tree.', 'not_found');
        const name = g.name(before.id);
        if (g.unionIdsOf(before.id).length > 0 || g.edgesOfChild(before.id).length > 0) {
          fail(`Remove ${name}’s relationships before deleting them.`, 'person_has_relationships');
        }
        if (g.focusPersonId === before.id) {
          fail(`${name} is the focus person. Choose someone else as the focus before deleting them.`, 'person_is_focus');
        }
        g.people.delete(before.id);
        applied.push(op);
        inverse.unshift({ op: 'person.create', person: before });
        break;
      }
      case 'union.create': {
        if (g.unions.has(op.union.id)) fail('That relationship already exists.', 'duplicate_id');
        const union: Union = { ...op.union, createdAt: createdAt(op.union.createdAt) };
        checkPartners(union);
        g.putUnion(union);
        applied.push({ op: 'union.create', union });
        inverse.unshift({ op: 'union.delete', id: union.id });
        break;
      }
      case 'union.update': {
        const before = g.unions.get(op.id) ?? fail('That relationship is no longer in this tree.', 'not_found');
        const patch = definedOnly({ ...op.patch });
        const after: Union = { ...before, ...patch };
        checkPartners(after);
        const partnersChanged = after.partnerAId !== before.partnerAId || after.partnerBId !== before.partnerBId;
        g.putUnion(after);
        if (partnersChanged) {
          for (const edge of g.edgesOfUnion(after.id)) checkChildOfUnion(edge.childId, after, edge.kind, edge.id);
        }
        applied.push({ op: 'union.update', id: op.id, patch });
        inverse.unshift({ op: 'union.update', id: op.id, patch: previousValues(before, patch) });
        break;
      }
      case 'union.delete': {
        const before = g.unions.get(op.id) ?? fail('That relationship is no longer in this tree.', 'not_found');
        if (g.edgesOfUnion(before.id).length > 0) {
          fail('Move or detach the children of this relationship before removing it.', 'union_has_children');
        }
        g.removeUnion(before.id);
        applied.push(op);
        inverse.unshift({ op: 'union.create', union: before });
        break;
      }
      case 'parentChild.create': {
        if (g.edges.has(op.edge.id)) fail('That parent link already exists.', 'duplicate_id');
        const union = g.unions.get(op.edge.unionId) ?? fail('That family is no longer in this tree.', 'not_found', 'unionId');
        checkChildOfUnion(op.edge.childId, union, op.edge.kind);
        const edge: ParentChild = { ...op.edge, createdAt: createdAt(op.edge.createdAt) };
        g.putEdge(edge);
        applied.push({ op: 'parentChild.create', edge });
        inverse.unshift({ op: 'parentChild.delete', id: edge.id });
        break;
      }
      case 'parentChild.update': {
        const before = g.edges.get(op.id) ?? fail('That parent link is no longer in this tree.', 'not_found');
        const patch = definedOnly({ ...op.patch });
        const after: ParentChild = { ...before, ...patch };
        const union = g.unions.get(after.unionId) ?? fail('That family is no longer in this tree.', 'not_found', 'unionId');
        checkChildOfUnion(after.childId, union, after.kind, before.id);
        g.putEdge(after);
        applied.push({ op: 'parentChild.update', id: op.id, patch });
        inverse.unshift({ op: 'parentChild.update', id: op.id, patch: previousValues(before, patch) });
        break;
      }
      case 'parentChild.delete': {
        const before = g.edges.get(op.id) ?? fail('That parent link is no longer in this tree.', 'not_found');
        g.removeEdge(before.id);
        applied.push(op);
        inverse.unshift({ op: 'parentChild.create', edge: before });
        break;
      }
      case 'tree.setFocus': {
        if (op.personId !== null && !g.people.has(op.personId)) fail('That person is no longer in this tree.', 'not_found');
        inverse.unshift({ op: 'tree.setFocus', personId: g.focusPersonId });
        g.focusPersonId = op.personId;
        applied.push(op);
        break;
      }
    }
  });

  return { graph: g.toGraph(), inverse, applied };
}

/** Full invariant sweep, for fixtures and imports. Returns human-readable problems; empty means valid. */
export function validateGraph(graph: TreeGraph): string[] {
  const problems: string[] = [];
  const people = new Set(graph.people.map((person) => person.id));
  const unions = new Map(graph.unions.map((union) => [union.id, union]));
  for (const union of graph.unions) {
    if (!people.has(union.partnerAId) || (union.partnerBId && !people.has(union.partnerBId))) {
      problems.push(`Union ${union.id} references a missing partner.`);
    }
    if (union.partnerAId === union.partnerBId) problems.push(`Union ${union.id} has the same person twice.`);
  }
  const seenLinks = new Set<string>();
  for (const edge of graph.parentChildren) {
    const union = unions.get(edge.unionId);
    if (!union) problems.push(`Edge ${edge.id} references a missing union.`);
    if (!people.has(edge.childId)) problems.push(`Edge ${edge.id} references a missing child.`);
    if (union && partnersOf(union).includes(edge.childId)) problems.push(`Edge ${edge.id}: child is a partner of their own union.`);
    for (const key of [`u:${edge.childId}:${edge.unionId}`, `k:${edge.childId}:${edge.kind}`]) {
      if (seenLinks.has(key)) problems.push(`Edge ${edge.id} duplicates ${key}.`);
      seenLinks.add(key);
    }
  }
  if (graph.focusPersonId && !people.has(graph.focusPersonId)) problems.push('Focus person is missing.');
  for (const person of graph.people) {
    for (const message of Object.values(personConsistencyIssues(person))) problems.push(`${person.id}: ${message}`);
  }
  // Cycle check: Kahn's algorithm over person → child edges.
  const children = new Map<string, string[]>();
  const indegree = new Map<string, number>([...people].map((id) => [id, 0]));
  for (const edge of graph.parentChildren) {
    const union = unions.get(edge.unionId);
    if (!union) continue;
    for (const parentId of partnersOf(union)) {
      children.set(parentId, [...(children.get(parentId) ?? []), edge.childId]);
      indegree.set(edge.childId, (indegree.get(edge.childId) ?? 0) + 1);
    }
  }
  const queue = [...indegree].filter(([, degree]) => degree === 0).map(([id]) => id);
  let visited = 0;
  while (queue.length > 0) {
    const id = queue.pop() as string;
    visited += 1;
    for (const childId of children.get(id) ?? []) {
      const next = (indegree.get(childId) ?? 0) - 1;
      indegree.set(childId, next);
      if (next === 0) queue.push(childId);
    }
  }
  if (visited !== people.size) problems.push('Someone is their own ancestor.');
  return problems;
}
