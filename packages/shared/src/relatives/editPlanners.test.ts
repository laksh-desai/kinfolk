import { describe, expect, it } from 'vitest';
import { applyChangeSet, validateGraph } from '../graph/applyChangeSet';
import { FixtureBuilder } from '../fixtures/fixtureBuilder';
import { buildSeedTree } from '../fixtures/seedTree';
import { resolveKinship } from '../kinship/resolveKinship';
import type { ChangeOp } from '../schemas/changeSet';
import type { TreeGraph } from '../schemas/graph';
import { deletionImpact, planDeletePerson } from './planDeletePerson';
import { mergeConflicts, planMerge } from './planMerge';
import { planChangeKind, planDetachParentLink, planDetachPartner, planReparent, planUpdateUnion } from './planRelationshipEdits';
import { PlanError } from './planState';

const NOW = '2026-09-13T00:00:00.000Z';
function run(graph: TreeGraph, ops: ChangeOp[]) {
  const result = applyChangeSet(graph, ops, { now: NOW });
  expect(validateGraph(result.graph)).toEqual([]);
  // Every plan must undo exactly.
  const back = applyChangeSet(result.graph, result.inverse, { now: NOW }).graph;
  expect(new Set(back.people.map((person) => person.id))).toEqual(new Set(graph.people.map((person) => person.id)));
  expect(back.parentChildren.length).toBe(graph.parentChildren.length);
  return result.graph;
}
const ids = () => {
  let n = 0;
  return () => `eeeeeeee-0000-4000-8000-${(++n).toString().padStart(12, '0')}`;
};

describe('deletionImpact and planDeletePerson (SPEC §3: never orphan a subtree)', () => {
  it('names every affected relationship and every descendant', () => {
    const { graph, people } = buildSeedTree();
    const impact = deletionImpact(graph, people.vikram.id);
    expect(impact.relationships).toEqual(
      expect.arrayContaining(['Husband of Priti Kapoor (divorced)', 'Husband of Nisha Sharma', 'Son of Mohan Sharma', 'Son of Sita Sharma', 'Father of Ravi Sharma (with Nisha Sharma)', 'Father of Karan Sharma (with Priti Kapoor)']),
    );
    expect(impact.descendants.map((person) => person.name)).toEqual(expect.arrayContaining(['Ravi Sharma', 'Aarav Sharma', 'Ruby Sharma', 'Luca Rossi']));
    expect(impact.wouldOrphan).toEqual([]);
    expect(impact.modes).toEqual(['remove', 'placeholder', 'with-descendants']);
  });

  it('removes a parent whose children still have the other parent, keeping them connected', () => {
    const { graph, people } = buildSeedTree();
    const after = run(graph, planDeletePerson(graph, people.vikram.id, 'remove'));
    expect(after.people.some((person) => person.id === people.vikram.id)).toBe(false);
    expect(resolveKinship(after, people.ravi.id, people.nisha.id).label).toBe('Mother');
    expect(resolveKinship(after, people.karan.id, people.priti.id).label).toBe('Mother');
  });

  it('refuses a plain remove that would orphan children, naming them', () => {
    const { graph, people } = buildSeedTree();
    expect(deletionImpact(graph, people.suresh.id).wouldOrphan.map((child) => child.name).sort()).toEqual(['Leo Okonkwo', 'Maya Sharma']);
    expect(deletionImpact(graph, people.suresh.id).modes).not.toContain('remove');
    expect(() => planDeletePerson(graph, people.suresh.id, 'remove')).toThrow(
      'Removing Suresh Sharma would leave Maya Sharma, Leo Okonkwo with no parent in the tree.',
    );
  });

  it('replaces someone with a placeholder, keeping every relationship', () => {
    const { graph, people } = buildSeedTree();
    const after = run(graph, planDeletePerson(graph, people.suresh.id, 'placeholder'));
    const suresh = after.people.find((person) => person.id === people.suresh.id)!;
    expect(suresh).toMatchObject({ firstName: '', isPlaceholder: true, birthDate: null });
    expect(resolveKinship(after, people.ravi.id, people.maya.id).label).toBe('First cousin');
  });

  it('deletes a whole branch, leaving married-in partners in place', () => {
    const { graph, people } = buildSeedTree();
    const after = run(graph, planDeletePerson(graph, people.anita.id, 'with-descendants'));
    for (const gone of [people.anita, people.lukas, people.emma, people.noah]) expect(after.people.some((person) => person.id === gone.id)).toBe(false);
    for (const stays of [people.tom, people.sofia, people.hannah]) expect(after.people.some((person) => person.id === stays.id)).toBe(true);
  });

  it('moves the focus when the focus person is deleted', () => {
    const { graph, people } = buildSeedTree();
    const after = run(graph, planDeletePerson(graph, people.ravi.id, 'remove', { newFocusId: people.asha.id }));
    expect(after.focusPersonId).toBe(people.asha.id);
  });
});

describe('planMerge (SPEC §4.6: merge people entered twice)', () => {
  it('lists conflicting fields, fills empty ones, and moves every relationship to the kept person', () => {
    const b = new FixtureBuilder(31);
    const suresh = b.person('Suresh', 'Sharma', { gender: 'male', born: [1964, 12, 25] });
    const maya = b.person('Maya', 'Sharma', { gender: 'female', born: [2000, 10, 2] });
    b.family(suresh, null, [maya]);
    const duplicate = b.person('Maya', 'S.', { gender: 'female', email: 'maya@example.com', born: [2000] });
    const partner = b.person('Omar', null, { gender: 'male' });
    const kid = b.person('Zain', null, { gender: 'male' });
    b.family(duplicate, partner, [kid]);
    const graph = b.build();

    expect(mergeConflicts(maya, duplicate)).toEqual(['lastName', 'birthDate']);
    const plan = planMerge(graph, maya.id, duplicate.id, { lastName: 'keep' }, { newId: ids() });
    const after = run(graph, plan.ops);
    const kept = after.people.find((person) => person.id === maya.id)!;
    expect(kept).toMatchObject({ lastName: 'Sharma', email: 'maya@example.com', birthDate: { year: 2000, month: 10, day: 2, approximate: false } });
    expect(after.people.some((person) => person.id === duplicate.id)).toBe(false);
    expect(resolveKinship(after, maya.id, partner.id).label).toBe('Husband');
    expect(resolveKinship(after, suresh.id, kid.id).label).toBe('Grandson');
  });

  it('turns a placeholder into the real person when merged with a named duplicate', () => {
    const { graph, people } = buildSeedTree();
    const b = { ...graph, people: [...graph.people, { ...people.samuel, id: 'ffffffff-0000-4000-8000-000000000001', firstName: 'Kala', lastName: 'Nair', notes: null }] };
    const plan = planMerge(b, people.radhaParent.id, 'ffffffff-0000-4000-8000-000000000001', {}, { newId: ids() });
    const after = run(b, plan.ops);
    expect(after.people.find((person) => person.id === people.radhaParent.id)).toMatchObject({ firstName: 'Kala', isPlaceholder: false });
  });

  it('collapses a duplicate couple, keeping all their children once', () => {
    const b = new FixtureBuilder(32);
    const ravi = b.person('Ravi', null, { gender: 'male' });
    const priya = b.person('Priya', null, { gender: 'female' });
    const aarav = b.person('Aarav', null, { gender: 'male' });
    b.family(ravi, priya, [aarav]);
    const ravi2 = b.person('Ravi', null, { gender: 'male' });
    const anika = b.person('Anika', null, { gender: 'female' });
    b.family(ravi2, priya, [anika]);
    const graph = b.build();
    const after = run(graph, planMerge(graph, ravi.id, ravi2.id, {}, { newId: ids() }).ops);
    expect(after.unions).toHaveLength(1);
    expect(resolveKinship(after, aarav.id, anika.id).label).toBe('Sister');
  });

  it('refuses to merge someone with themselves', () => {
    const { graph, people } = buildSeedTree();
    expect(() => planMerge(graph, people.ravi.id, people.ravi.id, {}, { newId: ids() })).toThrow(PlanError);
  });
});

describe('relationship edits (SPEC §4.6: fix, don’t delete)', () => {
  it('re-parents a child entered under the wrong family', () => {
    const { graph, people, unions } = buildSeedTree();
    const edge = graph.parentChildren.find((candidate) => candidate.childId === people.ethan.id)!;
    const after = run(graph, planReparent(graph, edge.id, unions.raviPriya.id));
    expect(resolveKinship(after, people.ravi.id, people.ethan.id).label).toBe('Son');
  });

  it('changes a parent link kind and a union status', () => {
    const { graph, people, unions } = buildSeedTree();
    const edge = graph.parentChildren.find((candidate) => candidate.childId === people.aarav.id)!;
    const adopted = run(graph, planChangeKind(edge.id, 'adopted'));
    expect(resolveKinship(adopted, people.ravi.id, people.aarav.id).label).toBe('Adopted son');
    const divorced = run(graph, planUpdateUnion(unions.raviPriya.id, { status: 'divorced', endDate: { year: 2020, month: null, day: null, approximate: false } }));
    expect(resolveKinship(divorced, people.ravi.id, people.priya.id).label).toBe('Former wife');
  });

  it('detaches a parent link without deleting anyone, tidying an emptied one-parent family', () => {
    const { graph, people } = buildSeedTree();
    const sanjayEdge = graph.parentChildren.find((candidate) => candidate.childId === people.sanjay.id)!;
    const ops = planDetachParentLink(graph, sanjayEdge.id);
    expect(ops.map((op) => op.op)).toEqual(['parentChild.delete', 'union.delete']);
    const after = run(graph, ops);
    expect(after.people.some((person) => person.id === people.sanjay.id)).toBe(true);
    expect(resolveKinship(after, people.priya.id, people.sanjay.id).label).toBe('No known relationship');
  });

  it('detaches a partner, keeping the children with the other parent', () => {
    const { graph, people, unions } = buildSeedTree();
    const after = run(graph, planDetachPartner(graph, unions.raviPriya.id, people.ravi.id));
    expect(resolveKinship(after, people.priya.id, people.aarav.id).label).toBe('Son');
    expect(resolveKinship(after, people.ravi.id, people.priya.id).category).not.toBe('partner');
  });
});
