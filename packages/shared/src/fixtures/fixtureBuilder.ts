import type { ChangeOp } from '../schemas/changeSet';
import type { PartialDate } from '../schemas/dates';
import type { TreeGraph } from '../schemas/graph';
import type { ParentChild, ParentChildKind } from '../schemas/parentChild';
import type { Gender, LifeStatus, Person, PersonFields } from '../schemas/person';
import type { Union, UnionStatus, UnionType } from '../schemas/union';

export type DateInput = [number, number?, number?] | PartialDate;

export interface PersonOptions extends Partial<Omit<PersonFields, 'birthDate' | 'deathDate'>> {
  gender?: Gender;
  lifeStatus?: LifeStatus;
  born?: DateInput;
  died?: DateInput;
  approximate?: boolean;
}

export interface UnionOptions {
  type?: UnionType;
  status?: UnionStatus;
  start?: DateInput;
  end?: DateInput;
}

const EPOCH = Date.UTC(2026, 0, 1);

function toDate(input: DateInput | undefined, approximate = false): PartialDate | null {
  if (!input) return null;
  if (!Array.isArray(input)) return input;
  const [year, month, day] = input;
  return { year, month: month ?? null, day: month ? (day ?? null) : null, approximate };
}

/**
 * Builds deterministic graphs for tests, seeds, and fixtures: ids and createdAt come from a
 * counter, so the same script always yields byte-identical data.
 */
export class FixtureBuilder {
  private counter = 0;
  private readonly people: Person[] = [];
  private readonly unions: Union[] = [];
  private readonly edges: ParentChild[] = [];
  private focus: string | null = null;

  constructor(private readonly namespace = 1) {}

  private nextId(): string {
    this.counter += 1;
    return `${this.namespace.toString(16).padStart(8, '0')}-0000-4000-8000-${this.counter.toString(16).padStart(12, '0')}`;
  }

  private nextCreatedAt(): string {
    return new Date(EPOCH + this.counter * 60_000).toISOString();
  }

  person(firstName: string, lastName: string | null = null, options: PersonOptions = {}): Person {
    const { born, died, approximate, gender, lifeStatus, ...rest } = options;
    const id = this.nextId();
    const person: Person = {
      id,
      createdAt: this.nextCreatedAt(),
      firstName,
      lastName,
      maidenName: null,
      nickname: null,
      suffix: null,
      gender: gender ?? 'unknown',
      lifeStatus: lifeStatus ?? (died ? 'deceased' : 'living'),
      birthDate: toDate(born, approximate),
      deathDate: toDate(died),
      birthPlace: null,
      maritalStatus: null,
      email: null,
      phone: null,
      address: null,
      photoUrl: null,
      publicRecordUrl: null,
      profession: null,
      notes: null,
      isPlaceholder: false,
      details: null,
      socials: null,
      linkedTreeId: null,
      ...rest,
    };
    this.people.push(person);
    this.focus ??= person.id;
    return person;
  }

  placeholder(options: PersonOptions = {}): Person {
    return this.person('', null, { ...options, isPlaceholder: true, lifeStatus: options.lifeStatus ?? 'unknown' });
  }

  union(partnerA: Person, partnerB: Person | null, options: UnionOptions = {}): Union {
    const union: Union = {
      id: this.nextId(),
      createdAt: this.nextCreatedAt(),
      partnerAId: partnerA.id,
      partnerBId: partnerB?.id ?? null,
      type: options.type ?? (partnerB ? 'marriage' : 'unknown'),
      status: options.status ?? 'current',
      startDate: toDate(options.start),
      endDate: toDate(options.end),
    };
    this.unions.push(union);
    return union;
  }

  child(union: Union, child: Person, kind: ParentChildKind = 'biological'): ParentChild {
    const edge: ParentChild = { id: this.nextId(), createdAt: this.nextCreatedAt(), unionId: union.id, childId: child.id, kind };
    this.edges.push(edge);
    return edge;
  }

  /** A union plus its biological children in one call. */
  family(partnerA: Person, partnerB: Person | null, children: Person[], options: UnionOptions = {}): Union {
    const union = this.union(partnerA, partnerB, options);
    for (const child of children) this.child(union, child);
    return union;
  }

  setFocus(person: Person | null): void {
    this.focus = person?.id ?? null;
  }

  build(): TreeGraph {
    return {
      people: [...this.people],
      unions: [...this.unions],
      parentChildren: [...this.edges],
      focusPersonId: this.focus,
    };
  }

  /** The graph as a ChangeSet against an empty tree — how the seed script and imports write it. */
  toOps(): ChangeOp[] {
    return graphToOps(this.build());
  }
}

export function graphToOps(graph: TreeGraph): ChangeOp[] {
  return [
    ...graph.people.map((person): ChangeOp => ({ op: 'person.create', person })),
    ...graph.unions.map((union): ChangeOp => ({ op: 'union.create', union })),
    ...graph.parentChildren.map((edge): ChangeOp => ({ op: 'parentChild.create', edge })),
    { op: 'tree.setFocus', personId: graph.focusPersonId },
  ];
}

export const EMPTY_GRAPH: TreeGraph = { people: [], unions: [], parentChildren: [], focusPersonId: null };
