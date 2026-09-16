import { applyChangeSet } from '../graph/applyChangeSet';
import { fullName } from '../graph/displayName';
import { indexGraph, type GraphIndex } from '../graph/graphIndex';
import type { ChangeOp, PersonCreateInput } from '../schemas/changeSet';
import type { TreeGraph } from '../schemas/graph';
import type { ParentChildKind } from '../schemas/parentChild';
import type { Person } from '../schemas/person';
import type { UnionStatus, UnionType } from '../schemas/union';

/** A planning failure the UI turns into a question or a message. */
export class PlanError extends Error {
  constructor(
    message: string,
    public readonly code: 'two_parents' | 'not_found' | 'union_has_children' | 'same_person' | 'invalid',
  ) {
    super(message);
    this.name = 'PlanError';
  }
}

export interface PlanContext {
  /** Mints ids for records the plan creates (the client passes crypto.randomUUID). */
  newId: () => string;
  /** Timestamp used for the working copy; the server stamps real createdAt values. */
  now?: string;
}

export function blankPerson(id: string, overrides: Partial<Person> = {}): PersonCreateInput {
  return {
    id,
    firstName: '',
    lastName: null,
    maidenName: null,
    nickname: null,
    suffix: null,
    gender: 'unknown',
    lifeStatus: 'living',
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
    isPlaceholder: false,
    details: null,
    socials: null,
    linkedTreeId: null,
    ...overrides,
  };
}

/**
 * Accumulates ops while keeping a working copy of the graph up to date, so each planning step
 * sees what earlier steps created. Every op goes through applyChangeSet, so an invalid plan
 * fails here, with the same message the server would give.
 */
export class PlanState {
  graph: TreeGraph;
  readonly ops: ChangeOp[] = [];
  /** Placeholders created by this plan, with the phrase that explains each one. */
  readonly placeholders: Array<{ id: string; phrase: string; role: string }> = [];
  private cachedIndex: GraphIndex | null = null;
  private readonly now: string;

  constructor(
    graph: TreeGraph,
    private readonly context: PlanContext,
  ) {
    this.graph = graph;
    this.now = context.now ?? '2000-01-01T00:00:00.000Z';
  }

  get index(): GraphIndex {
    this.cachedIndex ??= indexGraph(this.graph);
    return this.cachedIndex;
  }

  push(op: ChangeOp): void {
    this.graph = applyChangeSet(this.graph, [op], { now: new Date(Date.parse(this.now) + this.ops.length).toISOString() }).graph;
    this.ops.push(op);
    this.cachedIndex = null;
  }

  newId(): string {
    return this.context.newId();
  }

  person(id: string): Person {
    const person = this.graph.people.find((candidate) => candidate.id === id);
    if (!person) throw new PlanError('That person is no longer in this tree.', 'not_found');
    return person;
  }

  /** "Ravi", or "that parent" for a placeholder this plan created. */
  ref(id: string): string {
    const created = this.placeholders.find((entry) => entry.id === id);
    if (created) return `that ${created.role}`;
    const person = this.person(id);
    return person.firstName.trim() || fullName(person) || 'this unnamed person';
  }

  addPerson(person: PersonCreateInput): string {
    this.push({ op: 'person.create', person });
    return person.id;
  }

  addPlaceholder(role: string, forId: string): string {
    const phrase = `an unnamed ${role} for ${this.ref(forId)}`;
    const id = this.addPerson(blankPerson(this.newId(), { isPlaceholder: true, lifeStatus: 'unknown' }));
    this.placeholders.push({ id, phrase, role });
    return id;
  }

  addUnion(partnerAId: string, partnerBId: string | null, type: UnionType = 'unknown', status: UnionStatus = 'current'): string {
    const id = this.newId();
    this.push({ op: 'union.create', union: { id, partnerAId, partnerBId, type, status, startDate: null, endDate: null } });
    return id;
  }

  addEdge(unionId: string, childId: string, kind: ParentChildKind): string {
    const id = this.newId();
    this.push({ op: 'parentChild.create', edge: { id, unionId, childId, kind } });
    return id;
  }
}
