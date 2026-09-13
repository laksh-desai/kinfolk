import { describe, expect, it } from 'vitest';
import { EMPTY_GRAPH, FixtureBuilder } from '../fixtures/fixtureBuilder';
import type { ChangeOp } from '../schemas/changeSet';
import type { TreeGraph } from '../schemas/graph';
import { applyChangeSet, GraphValidationError, validateGraph } from './applyChangeSet';

const NOW = '2026-09-13T10:00:00.000Z';
const id = (n: number) => `aaaaaaaa-0000-4000-8000-${n.toString().padStart(12, '0')}`;

function apply(graph: TreeGraph, ops: ChangeOp[]) {
  return applyChangeSet(graph, ops, { now: NOW });
}

function errorOf(graph: TreeGraph, ops: ChangeOp[]): GraphValidationError {
  try {
    apply(graph, ops);
  } catch (error) {
    if (error instanceof GraphValidationError) return error;
    throw error;
  }
  throw new Error('expected a GraphValidationError');
}

/** Grandparents → parent → child, used by several cases. */
function threeGenerations() {
  const b = new FixtureBuilder(7);
  const grandpa = b.person('Hari', 'Sharma', { gender: 'male' });
  const grandma = b.person('Kamala', 'Sharma', { gender: 'female' });
  const dad = b.person('Vikram', 'Sharma', { gender: 'male' });
  const mum = b.person('Nisha', 'Rao', { gender: 'female' });
  const ravi = b.person('Ravi', 'Sharma', { gender: 'male' });
  const top = b.family(grandpa, grandma, [dad]);
  const parents = b.family(dad, mum, [ravi]);
  b.setFocus(ravi);
  return { graph: b.build(), grandpa, grandma, dad, mum, ravi, top, parents };
}

function roundTrips(graph: TreeGraph, ops: ChangeOp[]) {
  const forward = apply(graph, ops);
  const back = apply(forward.graph, forward.inverse);
  const sort = (g: TreeGraph) => ({
    people: [...g.people].sort((a, b) => a.id.localeCompare(b.id)),
    unions: [...g.unions].sort((a, b) => a.id.localeCompare(b.id)),
    parentChildren: [...g.parentChildren].sort((a, b) => a.id.localeCompare(b.id)),
    focusPersonId: g.focusPersonId,
  });
  expect(sort(back.graph)).toEqual(sort(graph));
  // And redo (the inverse of the inverse) reproduces the forward result.
  const redo = apply(back.graph, back.inverse);
  expect(sort(redo.graph)).toEqual(sort(forward.graph));
}

describe('applyChangeSet — creating', () => {
  it('adds a first person to an empty tree and stamps createdAt in op order', () => {
    const ops: ChangeOp[] = [
      { op: 'person.create', person: { ...new FixtureBuilder(1).person('Ravi'), id: id(1), createdAt: undefined } },
      { op: 'person.create', person: { ...new FixtureBuilder(2).person('Asha'), id: id(2), createdAt: undefined } },
    ];
    const { graph, applied } = apply(EMPTY_GRAPH, ops);
    expect(graph.people.map((person) => person.firstName)).toEqual(['Ravi', 'Asha']);
    const stamps = applied.map((op) => (op.op === 'person.create' ? op.person.createdAt : ''));
    expect(stamps).toEqual(['2026-09-13T10:00:00.000Z', '2026-09-13T10:00:00.001Z']);
  });

  it('never mutates the input graph', () => {
    const { graph, ravi } = threeGenerations();
    const snapshot = JSON.parse(JSON.stringify(graph));
    apply(graph, [{ op: 'person.update', id: ravi.id, patch: { firstName: 'Ravindra' } }]);
    expect(graph).toEqual(snapshot);
  });

  it('requires a first name for a real person but not for a placeholder', () => {
    const b = new FixtureBuilder(3);
    const unnamed = b.placeholder();
    expect(apply(EMPTY_GRAPH, [{ op: 'person.create', person: unnamed }]).graph.people).toHaveLength(1);
    const error = errorOf(EMPTY_GRAPH, [{ op: 'person.create', person: { ...unnamed, isPlaceholder: false } }]);
    expect(error.message).toBe('Enter a first name.');
    expect(error.field).toBe('firstName');
  });
});

describe('applyChangeSet — invariants, with plain-language errors', () => {
  it('refuses a cycle: a grandfather cannot become his grandson’s child', () => {
    const { graph, ravi, grandpa } = threeGenerations();
    const ops: ChangeOp[] = [
      { op: 'union.create', union: { id: id(10), partnerAId: ravi.id, partnerBId: null, type: 'unknown', status: 'current', startDate: null, endDate: null } },
      { op: 'parentChild.create', edge: { id: id(11), unionId: id(10), childId: grandpa.id, kind: 'biological' } },
    ];
    const error = errorOf(graph, ops);
    expect(error.code).toBe('cycle');
    expect(error.opIndex).toBe(1);
    expect(error.message).toBe(
      'That would make Hari Sharma their own ancestor, because Ravi Sharma already descends from Hari Sharma.',
    );
  });

  it('refuses a cycle introduced by changing a union’s partner', () => {
    const { graph, top, ravi } = threeGenerations();
    const error = errorOf(graph, [{ op: 'union.update', id: top.id, patch: { partnerBId: ravi.id } }]);
    expect(error.code).toBe('cycle');
  });

  it('refuses a person being their own partner or their own parent', () => {
    const { graph, ravi, parents } = threeGenerations();
    expect(errorOf(graph, [{ op: 'union.update', id: parents.id, patch: { partnerBId: parents.partnerAId } }]).code).toBe('self_partner');
    expect(
      errorOf(graph, [{ op: 'parentChild.create', edge: { id: id(20), unionId: parents.id, childId: parents.partnerAId, kind: 'adopted' } }]).message,
    ).toBe('Vikram Sharma can’t be their own parent.');
    void ravi;
  });

  it('allows a second parental union only with a different kind (SPEC §3)', () => {
    const { graph, ravi, grandpa, grandma } = threeGenerations();
    const aunt = new FixtureBuilder(9).person('Anita', 'Sharma');
    const adoptive = { id: id(30), partnerAId: aunt.id, partnerBId: null, type: 'unknown' as const, status: 'current' as const, startDate: null, endDate: null };
    const base: ChangeOp[] = [{ op: 'person.create', person: aunt }, { op: 'union.create', union: adoptive }];

    const duplicateKind = errorOf(graph, [...base, { op: 'parentChild.create', edge: { id: id(31), unionId: adoptive.id, childId: ravi.id, kind: 'biological' } }]);
    expect(duplicateKind.code).toBe('duplicate_parent_kind');
    expect(duplicateKind.message).toBe('Ravi Sharma already has biological parents. Choose another kind, such as adopted, step, or foster.');

    const ok = apply(graph, [...base, { op: 'parentChild.create', edge: { id: id(31), unionId: adoptive.id, childId: ravi.id, kind: 'adopted' } }]);
    expect(ok.graph.parentChildren.filter((edge) => edge.childId === ravi.id).map((edge) => edge.kind).sort()).toEqual(['adopted', 'biological']);
    void grandpa;
    void grandma;
  });

  it('blocks deleting a person who still has relationships, or who is the focus', () => {
    const { graph, dad, ravi } = threeGenerations();
    expect(errorOf(graph, [{ op: 'person.delete', id: dad.id }]).message).toBe('Remove Vikram Sharma’s relationships before deleting them.');
    const detached = new FixtureBuilder(5).person('Solo');
    const withFocus = { ...graph, people: [...graph.people, detached], focusPersonId: detached.id };
    expect(errorOf(withFocus, [{ op: 'person.delete', id: detached.id }]).code).toBe('person_is_focus');
    void ravi;
  });

  it('blocks removing a union that still has children, so no subtree is orphaned', () => {
    const { graph, parents } = threeGenerations();
    expect(errorOf(graph, [{ op: 'union.delete', id: parents.id }]).code).toBe('union_has_children');
  });

  it('rejects a date of death on someone marked living, and a death before birth', () => {
    const { graph, ravi } = threeGenerations();
    expect(errorOf(graph, [{ op: 'person.update', id: ravi.id, patch: { deathDate: { year: 2020, month: null, day: null, approximate: false } } }]).message).toBe(
      'Mark this person as deceased to add a date of death.',
    );
    expect(
      errorOf(graph, [
        {
          op: 'person.update',
          id: ravi.id,
          patch: { lifeStatus: 'deceased', birthDate: { year: 1990, month: null, day: null, approximate: false }, deathDate: { year: 1980, month: null, day: null, approximate: false } },
        },
      ]).message,
    ).toBe('The date of death is before the date of birth.');
  });

  it('reports which op failed so a multi-step change can be explained', () => {
    const { graph, ravi } = threeGenerations();
    const error = errorOf(graph, [
      { op: 'person.update', id: ravi.id, patch: { nickname: 'Rav' } },
      { op: 'person.delete', id: id(999) },
    ]);
    expect(error.opIndex).toBe(1);
    expect(error.code).toBe('not_found');
  });
});

describe('applyChangeSet — the four primitives work from any node (SPEC §4.1)', () => {
  it('adds parents above the topmost generation, to a married-in person, and to a placeholder', () => {
    const b = new FixtureBuilder(12);
    const topmost = b.person('Hari', 'Sharma');
    const son = b.person('Mohan', 'Sharma');
    b.family(topmost, null, [son]);
    const marriedIn = b.person('Sita');
    b.union(son, marriedIn);
    const unnamed = b.placeholder();
    b.union(marriedIn, unnamed, { status: 'divorced' });
    const graph = b.build();

    let n = 60;
    const ops = [topmost, marriedIn, unnamed].flatMap((person): ChangeOp[] => {
      const parent = { ...new FixtureBuilder(100 + n).person(`Parent of ${person.firstName || 'placeholder'}`), id: id(n++) };
      const unionId = id(n++);
      return [
        { op: 'person.create', person: parent },
        { op: 'union.create', union: { id: unionId, partnerAId: parent.id, partnerBId: null, type: 'unknown', status: 'current', startDate: null, endDate: null } },
        { op: 'parentChild.create', edge: { id: id(n++), unionId, childId: person.id, kind: 'biological' } },
      ];
    });
    const { graph: after } = apply(graph, ops);
    expect(validateGraph(after)).toEqual([]);
    for (const person of [topmost, marriedIn, unnamed]) {
      expect(after.parentChildren.some((edge) => edge.childId === person.id)).toBe(true);
    }
  });
});

describe('applyChangeSet — naming a placeholder', () => {
  it('clears isPlaceholder when a name is given, and undo restores it', () => {
    const b = new FixtureBuilder(4);
    const ravi = b.person('Ravi');
    const unnamed = b.placeholder();
    b.family(unnamed, null, [ravi]);
    const graph = b.build();
    const result = apply(graph, [{ op: 'person.update', id: unnamed.id, patch: { firstName: 'Deval' } }]);
    expect(result.graph.people.find((person) => person.id === unnamed.id)).toMatchObject({ firstName: 'Deval', isPlaceholder: false });
    expect(result.inverse).toEqual([{ op: 'person.update', id: unnamed.id, patch: { firstName: '', isPlaceholder: true } }]);
  });
});

describe('applyChangeSet — inverse is exact (undo, then redo)', () => {
  it('round-trips creates across all record types', () => {
    const { graph, ravi } = threeGenerations();
    const child = new FixtureBuilder(11).person('Aarav', 'Sharma');
    roundTrips(graph, [
      { op: 'person.create', person: child },
      { op: 'union.create', union: { id: id(40), partnerAId: ravi.id, partnerBId: null, type: 'unknown', status: 'current', startDate: null, endDate: null } },
      { op: 'parentChild.create', edge: { id: id(41), unionId: id(40), childId: child.id, kind: 'adopted' } },
      { op: 'tree.setFocus', personId: child.id },
    ]);
  });

  it('round-trips updates, including fields that were previously empty', () => {
    const { graph, ravi, parents } = threeGenerations();
    roundTrips(graph, [
      { op: 'person.update', id: ravi.id, patch: { nickname: 'Rav', email: 'ravi@example.com', birthDate: { year: 1988, month: 4, day: null, approximate: true } } },
      { op: 'union.update', id: parents.id, patch: { status: 'divorced', endDate: { year: 2001, month: null, day: null, approximate: false } } },
    ]);
  });

  it('round-trips a full detach-and-delete of a person', () => {
    const { graph, ravi, parents } = threeGenerations();
    const edge = graph.parentChildren.find((candidate) => candidate.childId === ravi.id && candidate.unionId === parents.id);
    roundTrips(graph, [
      { op: 'tree.setFocus', personId: null },
      { op: 'parentChild.delete', id: edge?.id ?? '' },
      { op: 'person.delete', id: ravi.id },
    ]);
  });

  it('round-trips re-parenting (moving a child to another union) and changing a kind', () => {
    const { graph, ravi, top } = threeGenerations();
    const edge = graph.parentChildren.find((candidate) => candidate.childId === ravi.id);
    roundTrips(graph, [{ op: 'parentChild.update', id: edge?.id ?? '', patch: { unionId: top.id, kind: 'adopted' } }]);
  });
});

describe('validateGraph', () => {
  it('accepts a well-formed graph and flags a cycle that bypassed applyChangeSet', () => {
    const { graph, ravi, top } = threeGenerations();
    expect(validateGraph(graph)).toEqual([]);
    const broken: TreeGraph = {
      ...graph,
      parentChildren: [...graph.parentChildren, { id: id(50), unionId: graph.unions[1]?.id ?? '', childId: graph.unions[0]?.partnerAId ?? '', kind: 'step', createdAt: NOW }],
    };
    expect(validateGraph(broken)).toContain('Someone is their own ancestor.');
    void ravi;
    void top;
  });
});
