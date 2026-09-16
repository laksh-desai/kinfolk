import { describe, expect, it } from 'vitest';
import { buildSeedTree } from '../fixtures/seedTree';
import { applyChangeSet, GraphValidationError, validateGraph } from '../graph/applyChangeSet';
import { indexGraph } from '../graph/graphIndex';
import { createKinshipResolver } from '../kinship/resolveKinship';
import type { ChangeOp } from '../schemas/changeSet';
import type { TreeGraph } from '../schemas/graph';
import { PARENT_CHILD_KINDS } from '../schemas/parentChild';
import { planAddRelative, RELATIONS } from './planAddRelative';
import { deletionImpact, planDeletePerson } from './planDeletePerson';
import { mergeConflicts, planMerge } from './planMerge';
import { planChangeKind, planDetachParentLink, planDetachPartner, planReparent, planUpdateUnion } from './planRelationshipEdits';
import { blankPerson, PlanError } from './planState';

/**
 * Every planner, run against every person, union, and link in the 60-person fixture. Each case
 * asserts the same three things: the plan applies, the result is a valid graph, and its inverse
 * restores the tree exactly. Problems are collected and asserted once — per-case `expect` over
 * thousands of cases costs minutes.
 */

const NOW = '2026-09-16T00:00:00.000Z';
const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);

function normalise(graph: TreeGraph) {
  return {
    people: [...graph.people].sort(byId),
    unions: [...graph.unions].sort(byId),
    parentChildren: [...graph.parentChildren].sort(byId),
    focusPersonId: graph.focusPersonId,
  };
}

/** Applies a plan and checks the invariants. Returns a problem sentence, or null when all is well. */
function check(label: string, graph: TreeGraph, ops: ChangeOp[]): string | null {
  let result;
  try {
    result = applyChangeSet(graph, ops, { now: NOW });
  } catch (error) {
    return `${label}: applying the plan threw — ${error instanceof Error ? error.message : String(error)}`;
  }
  const invalid = validateGraph(result.graph);
  if (invalid.length > 0) return `${label}: left an invalid graph — ${invalid.join('; ')}`;
  try {
    const back = applyChangeSet(result.graph, result.inverse, { now: NOW }).graph;
    expect(normalise(back)).toEqual(normalise(graph));
  } catch (error) {
    return `${label}: undo did not restore the tree — ${error instanceof Error ? error.message.slice(0, 200) : String(error)}`;
  }
  return null;
}

/** A plan that refuses with a plain message is a valid outcome; anything else is a bug. */
function refusal(label: string, error: unknown): string | null {
  if (error instanceof PlanError || error instanceof GraphValidationError) {
    return error.message.trim().length > 0 ? null : `${label}: refused with an empty message`;
  }
  return `${label}: threw ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`;
}

function ids(prefix: string) {
  let n = 0;
  return () => `${prefix}-0000-4000-8000-${(++n).toString().padStart(12, '0')}`;
}

const { graph: SEED, people: SEED_PEOPLE } = buildSeedTree();
const NAMES = new Map(SEED.people.map((person) => [person.id, [person.firstName, person.lastName].filter(Boolean).join(' ') || 'an unnamed person']));
const name = (id: string) => NAMES.get(id) ?? id;

describe('sweep: adding every relation to every person (SPEC §4.1, §4.2)', () => {
  it('always leaves a valid graph that undoes exactly, or refuses with a message', () => {
    const problems: string[] = [];
    for (const person of SEED.people) {
      for (const relation of RELATIONS) {
        const label = `${relation.key} of ${name(person.id)}`;
        const newPerson = blankPerson('dddddddd-0000-4000-8000-000000000001', { firstName: 'New', gender: relation.gender ?? 'female' });
        try {
          const plan = planAddRelative(SEED, { anchorId: person.id, relation: relation.key, person: newPerson }, { newId: ids('cccccccc') });
          const problem = check(label, SEED, plan.ops);
          if (problem) problems.push(problem);
          else if (!plan.summary.startsWith('Added New as')) problems.push(`${label}: summary reads "${plan.summary}"`);
        } catch (error) {
          const problem = refusal(label, error);
          if (problem) problems.push(problem);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('never reads as a step-relationship when the new partner joins a one-parent family', () => {
    const problems: string[] = [];
    const index = indexGraph(SEED);
    for (const union of SEED.unions) {
      if (union.partnerBId !== null) continue;
      const children = index.childEdgesOf(union.id);
      if (children.length === 0) continue;
      const partner = blankPerson('dddddddd-0000-4000-8000-000000000002', { firstName: 'New', gender: 'female' });
      const plan = planAddRelative(SEED, { anchorId: union.partnerAId, relation: 'spouse', person: partner }, { newId: ids('cccccccc') });
      const after = applyChangeSet(SEED, plan.ops, { now: NOW }).graph;
      const resolve = createKinshipResolver(after);
      for (const edge of children) {
        const label = resolve(edge.childId, partner.id).label;
        if (/^Step-/.test(label)) problems.push(`${name(edge.childId)} reads "${label}" for their parent's new spouse`);
      }
    }
    expect(problems).toEqual([]);
  });
});

describe('sweep: deleting every person, every way (SPEC §3)', () => {
  it('offers modes that all apply, leave a valid graph, and undo exactly', () => {
    const problems: string[] = [];
    for (const person of SEED.people) {
      const impact = deletionImpact(SEED, person.id);
      if (impact.modes.length === 0) problems.push(`${name(person.id)}: no way to delete them`);
      for (const mode of impact.modes) {
        const label = `delete ${name(person.id)} (${mode})`;
        try {
          const ops = planDeletePerson(SEED, person.id, mode);
          const problem = check(label, SEED, ops);
          if (problem) {
            problems.push(problem);
            continue;
          }
          const after = applyChangeSet(SEED, ops, { now: NOW }).graph;
          const left = new Set(after.people.map((candidate) => candidate.id));
          const gone = new Set(SEED.people.map((candidate) => candidate.id).filter((id) => !left.has(id)));
          if (mode === 'placeholder' && gone.size > 0) problems.push(`${label}: removed ${gone.size} people`);
          if (mode === 'remove' && (gone.size !== 1 || !gone.has(person.id))) problems.push(`${label}: removed ${[...gone].map(name).join(', ')}`);
          if (mode === 'with-descendants' && gone.size !== impact.descendants.length + 1) {
            problems.push(`${label}: removed ${gone.size} people, expected ${impact.descendants.length + 1}`);
          }
          if (after.focusPersonId && !after.people.some((candidate) => candidate.id === after.focusPersonId)) problems.push(`${label}: focus points at someone who is gone`);
        } catch (error) {
          const problem = refusal(label, error);
          if (problem) problems.push(problem);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('keeps every other relationship of the people left behind', () => {
    const problems: string[] = [];
    for (const person of SEED.people) {
      const ops = planDeletePerson(SEED, person.id, 'remove');
      const after = applyChangeSet(SEED, ops, { now: NOW }).graph;
      // Their own link to their parents goes, and so may links in families they were a partner in.
      const touched = new Set<string>();
      for (const union of SEED.unions) if (union.partnerAId === person.id || union.partnerBId === person.id) touched.add(union.id);
      const lostEdges = SEED.parentChildren.filter(
        (edge) => !after.parentChildren.some((kept) => kept.id === edge.id) && edge.childId !== person.id && !touched.has(edge.unionId),
      );
      if (lostEdges.length > 0) problems.push(`removing ${name(person.id)} also dropped ${lostEdges.length} unrelated parent links`);
      const lostPeople = SEED.people.filter((other) => other.id !== person.id && !after.people.some((kept) => kept.id === other.id));
      if (lostPeople.length > 0) problems.push(`removing ${name(person.id)} also removed ${lostPeople.map((other) => name(other.id)).join(', ')}`);
    }
    expect(problems).toEqual([]);
  });
});

describe('sweep: correcting every relationship (SPEC §4.6)', () => {
  it('changes every link kind, detaches every link, and re-parents into every family', () => {
    const problems: string[] = [];
    const index = indexGraph(SEED);
    for (const edge of SEED.parentChildren) {
      const who = `${name(edge.childId)}’s link`;
      for (const kind of PARENT_CHILD_KINDS) {
        if (kind === edge.kind) continue;
        const problem = (() => {
          try {
            return check(`${who} → ${kind}`, SEED, planChangeKind(edge.id, kind));
          } catch (error) {
            return refusal(`${who} → ${kind}`, error);
          }
        })();
        if (problem) problems.push(problem);
      }
      const detach = check(`detach ${who}`, SEED, planDetachParentLink(SEED, edge.id));
      if (detach) problems.push(detach);
      for (const union of SEED.unions) {
        if (union.id === edge.unionId) continue;
        const label = `move ${name(edge.childId)} to family ${union.id.slice(-4)}`;
        try {
          const problem = check(label, SEED, planReparent(SEED, edge.id, union.id));
          if (problem) problems.push(problem);
        } catch (error) {
          const problem = refusal(label, error);
          if (problem) problems.push(problem);
        }
      }
    }
    for (const union of SEED.unions) {
      const label = `family ${union.id.slice(-4)}`;
      const status = check(`${label} status`, SEED, planUpdateUnion(union.id, { status: 'separated', endDate: { year: 2020, month: null, day: null, approximate: false } }));
      if (status) problems.push(status);
      if (union.partnerBId === null) continue;
      for (const leaving of [union.partnerAId, union.partnerBId]) {
        const detach = check(`${name(leaving)} leaves ${label}`, SEED, planDetachPartner(SEED, union.id, leaving));
        if (detach) problems.push(detach);
        const after = applyChangeSet(SEED, planDetachPartner(SEED, union.id, leaving), { now: NOW }).graph;
        const orphaned = index.childEdgesOf(union.id).filter((edge) => !after.parentChildren.some((kept) => kept.id === edge.id));
        if (orphaned.length > 0) problems.push(`${name(leaving)} leaving ${label} dropped ${orphaned.length} children`);
      }
    }
    expect(problems).toEqual([]);
  });
});

describe('sweep: merging duplicates (SPEC §4.6)', () => {
  it('merges any pair of people without breaking the graph, or refuses with a message', () => {
    const problems: string[] = [];
    // Every person merged with a handful of others: enough to cross every shape of relationship
    // (partners, parent and child, siblings, strangers) without 3,600 full graph copies.
    const others = [SEED_PEOPLE.ravi, SEED_PEOPLE.priya, SEED_PEOPLE.vikram, SEED_PEOPLE.samuel, SEED_PEOPLE.maya];
    for (const person of SEED.people) {
      for (const other of others) {
        if (person.id === other.id) continue;
        const label = `merge ${name(person.id)} with ${name(other.id)}`;
        try {
          const resolution = Object.fromEntries(mergeConflicts(person, other).map((field) => [field, 'keep' as const]));
          const plan = planMerge(SEED, person.id, other.id, resolution, { newId: ids('bbbbbbbb') });
          const problem = check(label, SEED, plan.ops);
          if (problem) problems.push(problem);
        } catch (error) {
          const problem = refusal(label, error);
          if (problem) problems.push(problem);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
