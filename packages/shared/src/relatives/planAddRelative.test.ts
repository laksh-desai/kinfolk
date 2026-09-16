import { describe, expect, it } from 'vitest';
import { applyChangeSet, validateGraph } from '../graph/applyChangeSet';
import { FixtureBuilder } from '../fixtures/fixtureBuilder';
import { buildSeedTree } from '../fixtures/seedTree';
import { resolveKinship } from '../kinship/resolveKinship';
import type { TreeGraph } from '../schemas/graph';
import { connectionSteps, NEW_PERSON, NEW_UNION, planAddDetached, planAddRelative, RELATIONS, SOLO_UNION, type RelationKey } from './planAddRelative';
import { blankPerson, PlanError } from './planState';

function idFactory(prefix = 'cccccccc') {
  let n = 0;
  return () => `${prefix}-0000-4000-8000-${(++n).toString().padStart(12, '0')}`;
}

function add(graph: TreeGraph, anchorId: string, relation: RelationKey, extra: Partial<Parameters<typeof planAddRelative>[1]> = {}) {
  const spec = RELATIONS.find((entry) => entry.key === relation)!;
  const newId = idFactory();
  const person = blankPerson('dddddddd-0000-4000-8000-000000000001', { firstName: 'New', gender: spec.gender ?? 'female' });
  const plan = planAddRelative(graph, { anchorId, relation, person, ...extra }, { newId });
  const after = applyChangeSet(graph, plan.ops, { now: '2026-09-13T00:00:00.000Z' }).graph;
  expect(validateGraph(after)).toEqual([]);
  return { plan, after, label: resolveKinship(after, anchorId, person.id).label };
}

/** What each relation should read as from the anchor's side, for a female new person (gender presets aside). */
const EXPECTED_FROM_ANYONE: Record<RelationKey, string> = {
  parent: 'Mother',
  mother: 'Mother',
  father: 'Father',
  sibling: 'Sister',
  brother: 'Brother',
  sister: 'Sister',
  'half-sibling': 'Half-sister',
  'step-sibling': 'Step-sister',
  partner: 'Partner',
  spouse: 'Wife',
  'former-spouse': 'Former wife',
  'unmarried-partner': 'Partner',
  child: 'Daughter',
  son: 'Son',
  daughter: 'Daughter',
  'step-child': 'Step-daughter',
  'adopted-child': 'Adopted daughter',
  grandparent: 'Grandmother',
  grandchild: 'Granddaughter',
  'great-grandparent': 'Great-grandmother',
  'great-grandchild': 'Great-granddaughter',
  'aunt-uncle': 'Aunt',
  'niece-nephew': 'Niece',
  cousin: 'First cousin',
  'parent-in-law': 'Mother-in-law',
  'sibling-in-law': 'Sister-in-law',
  'child-in-law': 'Daughter-in-law',
};

function smallFamily() {
  const b = new FixtureBuilder(21);
  const hari = b.person('Hari', 'Sharma', { gender: 'male' });
  const kamala = b.person('Kamala', 'Sharma', { gender: 'female' });
  const mohan = b.person('Mohan', 'Sharma', { gender: 'male' });
  b.family(hari, kamala, [mohan], { type: 'marriage' });
  const sita = b.person('Sita', 'Sharma', { gender: 'female' });
  const vikram = b.person('Vikram', 'Sharma', { gender: 'male' });
  b.family(mohan, sita, [vikram], { type: 'marriage' });
  const unnamed = b.placeholder();
  b.setFocus(hari);
  return { graph: b.build(), hari, sita, unnamed };
}

describe('planAddRelative — every §4.2 relation works from any node (SPEC §4.1, §12)', () => {
  const { graph, hari, sita, unnamed } = smallFamily();

  describe.each<[string, string, Partial<Record<RelationKey, string>>, Partial<Record<RelationKey, { kind: 'adopted' }>>]>([
    ['the topmost generation (Hari)', hari.id, {}, {}],
    // Sita's husband already has both birth parents, so a parent-in-law must be another kind.
    ['a married-in person (Sita)', sita.id, {}, { 'parent-in-law': { kind: 'adopted' as const } }],
    [
      'an unnamed placeholder',
      unnamed.id,
      { 'parent-in-law': 'Partner’s mother', 'sibling-in-law': 'Partner’s sister' } as Partial<Record<RelationKey, string>>,
      {},
    ],
  ])('from %s', (_label, anchorId, overrides, requestExtras: Partial<Record<RelationKey, { kind: 'adopted' }>>) => {
    it.each(RELATIONS.map((relation) => relation.key))('%s', (relation) => {
      const { label } = add(graph, anchorId, relation, requestExtras[relation] ?? {});
      expect(label).toBe(overrides[relation] ?? EXPECTED_FROM_ANYONE[relation]);
    });
  });

  it('refuses a third birth parent-in-law with a message naming the partner', () => {
    const person = blankPerson('dddddddd-0000-4000-8000-000000000008', { firstName: 'Rosa', gender: 'female' });
    expect(() => planAddRelative(graph, { anchorId: sita.id, relation: 'parent-in-law', person }, { newId: idFactory() })).toThrow(
      'Mohan already has two birth parents. Add this person as an adoptive, step, foster, or guardian parent instead.',
    );
  });
});

describe('placeholders and the summary sentence (SPEC §4.2)', () => {
  it('creates and names the unnamed people needed to reach a cousin', () => {
    const { graph, hari } = smallFamily();
    const { plan, after } = add(graph, hari.id, 'cousin');
    expect(plan.placeholderIds).toHaveLength(3);
    expect(plan.placeholderIds.every((id) => after.people.find((person) => person.id === id)?.isPlaceholder)).toBe(true);
    expect(plan.summary).toBe(
      'Added New as Hari’s cousin. To connect her we also added an unnamed parent for Hari, an unnamed parent for that parent and an unnamed sibling for that parent — you can name them anytime.',
    );
  });

  it('reuses the relatives the user picks, creating nothing extra', () => {
    const { graph, people } = buildSeedTree();
    const { plan, label } = add(graph, people.ravi.id, 'cousin', { via: { parentId: people.vikram.id, auntUncleId: people.anita.id } });
    expect(plan.placeholderIds).toEqual([]);
    expect(plan.summary).toBe('Added New as Ravi’s cousin.');
    expect(label).toBe('First cousin');
  });

  it('uses the only obvious candidate without asking, and a single placeholder reads "it"', () => {
    const { graph, sita } = smallFamily();
    const { plan } = add(graph, sita.id, 'grandchild');
    expect(plan.placeholderIds).toEqual([]);
    const lone = new FixtureBuilder(5);
    const ego = lone.person('Asha', null, { gender: 'female' });
    const child = add(lone.build(), ego.id, 'grandchild');
    expect(child.plan.summary).toBe('Added New as Asha’s granddaughter. To connect her we also added an unnamed child for Asha — you can name it anytime.');
  });
});

describe('the hard cases', () => {
  it('refuses a third birth parent, and accepts an adoptive one instead (QUESTIONS Q12)', () => {
    const { graph, people } = buildSeedTree();
    const person = blankPerson('dddddddd-0000-4000-8000-000000000009', { firstName: 'Rosa', gender: 'female' });
    expect(() => planAddRelative(graph, { anchorId: people.ravi.id, relation: 'mother', person }, { newId: idFactory() })).toThrow(PlanError);
    expect(connectionSteps(graph, people.ravi.id, 'mother').needsParentKind).toBe(true);
    const { label } = add(graph, people.ravi.id, 'mother', { kind: 'adopted' });
    expect(label).toBe('Adoptive mother');
  });

  it('adds the second parent into the same family as the first (SPEC §4.1)', () => {
    const b = new FixtureBuilder(6);
    const child = b.person('Ravi', null, { gender: 'male' });
    const dad = b.person('Vikram', null, { gender: 'male' });
    const family = b.family(dad, null, [child]);
    const { after, label } = add(b.build(), child.id, 'mother');
    expect(label).toBe('Mother');
    expect(after.unions.find((union) => union.id === family.id)?.partnerBId).toBe('dddddddd-0000-4000-8000-000000000001');
  });

  it('adds a spouse into the one-parent family, so the children get a second parent not a step-parent', () => {
    const b = new FixtureBuilder(7);
    const dad = b.person('Bala', 'Menon', { gender: 'male' });
    const kid = b.person('Deepa', 'Menon', { gender: 'female' });
    const kid2 = b.person('Ravi', 'Menon', { gender: 'male' });
    const family = b.family(dad, null, [kid, kid2]);
    const graph = b.build();

    const step = connectionSteps(graph, dad.id, 'spouse').steps[0];
    expect(step?.question).toBe('Is this person also a parent of Deepa Menon and Ravi Menon?');
    expect(step?.options.map((option) => option.label)).toEqual(['Yes — their other parent', 'No — a separate family']);

    const { after, label, plan } = add(graph, dad.id, 'spouse');
    expect(label).toBe('Wife');
    expect(after.unions).toHaveLength(1);
    expect(after.unions[0]).toMatchObject({ id: family.id, partnerBId: 'dddddddd-0000-4000-8000-000000000001', type: 'marriage', status: 'current' });
    expect(resolveKinship(after, kid.id, 'dddddddd-0000-4000-8000-000000000001').label).toBe('Mother');
    expect(plan.summary).toBe('Added New as Bala’s wife. She is also recorded as a parent of Deepa and Ravi.');
    expect(plan.headline).toBe('Added New as Bala’s wife');
  });

  it('keeps a later partner out of the children’s family when the user says so', () => {
    const b = new FixtureBuilder(8);
    const dad = b.person('Bala', 'Menon', { gender: 'male' });
    const kid = b.person('Deepa', 'Menon', { gender: 'female' });
    b.family(dad, null, [kid]);
    const graph = b.build();

    const { after, label, plan } = add(graph, dad.id, 'spouse', { via: { unionId: NEW_UNION } });
    expect(label).toBe('Wife');
    expect(after.unions).toHaveLength(2);
    expect(resolveKinship(after, kid.id, 'dddddddd-0000-4000-8000-000000000001').label).toBe('Step-mother');
    expect(plan.summary).toBe('Added New as Bala’s wife.');
  });

  it('asks nothing and starts a new family when the anchor has no one-parent family', () => {
    const { graph, people } = buildSeedTree();
    // Vikram's children already have their other parents: a new spouse is a new union.
    expect(connectionSteps(graph, people.vikram.id, 'spouse').steps).toEqual([]);
    const { after } = add(graph, people.vikram.id, 'spouse');
    expect(after.unions.length).toBe(graph.unions.length + 1);
    expect(resolveKinship(after, people.ravi.id, 'dddddddd-0000-4000-8000-000000000001').label).toBe('Step-mother');
  });

  it('makes a half-sibling through the chosen shared parent, in a separate family', () => {
    const { graph, people } = buildSeedTree();
    const { label } = add(graph, people.ravi.id, 'half-sibling', { via: { sharedParentId: people.nisha.id } });
    expect(label).toBe('Half-sister');
  });

  it('adds a child to a chosen union (with the right partner) or on their own', () => {
    const { graph, people, unions } = buildSeedTree();
    const withPriya = add(graph, people.ravi.id, 'daughter', { via: { unionId: unions.raviPriya.id } });
    expect(resolveKinship(withPriya.after, people.priya.id, 'dddddddd-0000-4000-8000-000000000001').label).toBe('Daughter');
    const alone = add(graph, people.ravi.id, 'daughter');
    expect(resolveKinship(alone.after, people.priya.id, 'dddddddd-0000-4000-8000-000000000001').label).toBe('Step-daughter');
  });

  it('adds a sibling-in-law either way round', () => {
    const { graph, people } = buildSeedTree();
    expect(add(graph, people.ravi.id, 'sibling-in-law', { via: { partnerId: people.priya.id } }).label).toBe('Sister-in-law');
    expect(add(graph, people.ravi.id, 'sibling-in-law', { siblingInLawVia: 'sibling', via: { siblingId: people.dev.id } }).label).toBe('Sister-in-law');
  });

  it('connects through a new unnamed person when the user says the link isn’t in the tree yet', () => {
    const { graph, people } = buildSeedTree();
    // Ravi has aunts and uncles on Vikram’s side, but this cousin is the child of one not yet entered.
    const cousin = add(graph, people.ravi.id, 'cousin', { via: { parentId: people.vikram.id, auntUncleId: NEW_PERSON } });
    expect(cousin.label).toBe('First cousin');
    expect(cousin.plan.summary).toBe('Added New as Ravi’s cousin. To connect her we also added an unnamed sibling for Vikram — you can name it anytime.');
    const grandchild = add(graph, people.vikram.id, 'grandchild', { via: { childId: NEW_PERSON } });
    expect(grandchild.label).toBe('Granddaughter');
    expect(grandchild.plan.placeholderIds).toHaveLength(1);
    const withSomeone = add(graph, people.ravi.id, 'daughter', { via: { unionId: NEW_PERSON } });
    expect(withSomeone.plan.placeholderIds).toHaveLength(1);
    expect(resolveKinship(withSomeone.after, people.priya.id, 'dddddddd-0000-4000-8000-000000000001').label).toBe('Step-daughter');
    const solo = add(graph, people.ravi.id, 'daughter', { via: { unionId: SOLO_UNION } });
    expect(solo.plan.placeholderIds).toEqual([]);
    const stepSibling = add(graph, people.ravi.id, 'step-sibling', { via: { parentId: people.vikram.id, partnerId: NEW_PERSON } });
    expect(stepSibling.label).toBe('Step-sister');
    expect(stepSibling.plan.placeholderIds).toHaveLength(1);
  });

  it('rejects a "via" person who is not actually related that way', () => {
    const { graph, people } = buildSeedTree();
    const person = blankPerson('dddddddd-0000-4000-8000-000000000003', { firstName: 'X' });
    expect(() =>
      planAddRelative(graph, { anchorId: people.ravi.id, relation: 'grandparent', via: { parentId: people.hari.id }, person }, { newId: idFactory() }),
    ).toThrow('That person isn’t a parent here.');
  });

  it('adds a detached first person and makes them the tree head', () => {
    const empty: TreeGraph = { people: [], unions: [], parentChildren: [], focusPersonId: null };
    const person = blankPerson('dddddddd-0000-4000-8000-000000000004', { firstName: 'Ravi' });
    const plan = planAddDetached(empty, person, { newId: idFactory() });
    const after = applyChangeSet(empty, plan.ops, { now: '2026-09-13T00:00:00.000Z' }).graph;
    expect(after.focusPersonId).toBe(person.id);
    expect(plan.summary).toBe('Added Ravi as the first person in this tree.');
  });
});

describe('connectionSteps', () => {
  it('asks only the questions that have real answers, in order', () => {
    const { graph, people } = buildSeedTree();
    const cousin = connectionSteps(graph, people.ravi.id, 'cousin');
    expect(cousin.steps.map((step) => step.key)).toEqual(['parentId']);
    expect(cousin.steps[0]?.options.map((option) => option.label).sort()).toEqual(['Nisha Sharma', 'Vikram Sharma']);
    const withParent = connectionSteps(graph, people.ravi.id, 'cousin', { parentId: people.vikram.id });
    expect(withParent.steps[1]?.options.map((option) => option.label).sort()).toEqual(['Anita Becker', 'Karan Sharma', 'Suresh Sharma'].filter((name) => name !== 'Karan Sharma'));
    const child = connectionSteps(graph, people.ravi.id, 'child');
    expect(child.steps[0]?.options.map((option) => option.label)).toEqual(['With Priya Sharma', 'Ravi on their own (other parent not recorded)']);
    expect(connectionSteps(graph, people.samuel.id, 'cousin').steps).toEqual([]);
  });
});
