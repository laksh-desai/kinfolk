import { describe, expect, it } from 'vitest';
import { applyChangeSet, validateGraph } from '../graph/applyChangeSet';
import { indexGraph } from '../graph/graphIndex';
import type { TreeGraph } from '../schemas/graph';
import { EMPTY_GRAPH, graphToOps } from './fixtureBuilder';
import { buildLargeTree } from './largeTree';
import { buildSeedTree } from './seedTree';

function connectedComponents(graph: TreeGraph): string[][] {
  const neighbours = new Map<string, Set<string>>(graph.people.map((person) => [person.id, new Set()]));
  const link = (a: string, b: string) => {
    neighbours.get(a)?.add(b);
    neighbours.get(b)?.add(a);
  };
  const unions = new Map(graph.unions.map((union) => [union.id, union]));
  for (const union of graph.unions) if (union.partnerBId) link(union.partnerAId, union.partnerBId);
  for (const edge of graph.parentChildren) {
    const union = unions.get(edge.unionId);
    if (union) link(union.partnerAId, edge.childId);
  }
  const seen = new Set<string>();
  const components: string[][] = [];
  for (const person of graph.people) {
    if (seen.has(person.id)) continue;
    const component: string[] = [];
    const stack = [person.id];
    seen.add(person.id);
    while (stack.length > 0) {
      const id = stack.pop() as string;
      component.push(id);
      for (const next of neighbours.get(id) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      }
    }
    components.push(component);
  }
  return components;
}

function generationDepth(graph: TreeGraph): number {
  const index = indexGraph(graph);
  const memo = new Map<string, number>();
  const depth = (id: string): number => {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    const parents = index.parentsOf(id);
    const value = parents.length === 0 ? 0 : 1 + Math.max(...parents.map((link) => depth(link.parentId)));
    memo.set(id, value);
    return value;
  };
  return Math.max(...graph.people.map((person) => depth(person.id))) + 1;
}

describe('seed tree fixture', () => {
  const { graph, people: p, unions: u } = buildSeedTree();
  const index = indexGraph(graph);
  const parentIds = (id: string) => index.parentsOf(id).map((link) => link.parentId).sort();
  const childIds = (unionId: string) => index.childEdgesOf(unionId).map((edge) => edge.childId);

  it('is a valid graph of about sixty people, focused on Ravi', () => {
    expect(validateGraph(graph)).toEqual([]);
    expect(graph.people.length).toBeGreaterThanOrEqual(55);
    expect(graph.people.length).toBeLessThanOrEqual(65);
    expect(graph.focusPersonId).toBe(p.ravi.id);
  });

  it('can be written through applyChangeSet from an empty tree, exactly as the seed script does', () => {
    const { graph: written } = applyChangeSet(EMPTY_GRAPH, graphToOps(graph), { now: '2026-09-13T00:00:00.000Z' });
    expect(written).toEqual(graph);
  });

  it('§4.5.1 has a person with no relationships at all', () => {
    expect(index.unionsOf(p.samuel.id)).toEqual([]);
    expect(index.parentEdgesOf(p.samuel.id)).toEqual([]);
  });

  it('§4.5.2 has a couple with no children', () => {
    const couple = index.unionsOf(p.emma.id).find((union) => union.partnerBId === p.hannah.id);
    expect(couple && childIds(couple.id)).toEqual([]);
  });

  it('§4.5.3 has a couple with several children', () => {
    expect(childIds(u.mohanSita.id)).toHaveLength(3);
  });

  it('§4.5.4 has a single parent with children', () => {
    expect(u.sureshAlone.partnerBId).toBeNull();
    expect(childIds(u.sureshAlone.id).length).toBeGreaterThanOrEqual(2);
  });

  it('§4.5.5 has remarriage: one person in two unions, children in each, one divorced', () => {
    const vikramUnions = index.unionsOf(p.vikram.id);
    expect(vikramUnions).toHaveLength(2);
    expect(vikramUnions.every((union) => childIds(union.id).length > 0)).toBe(true);
    expect(vikramUnions.map((union) => union.status).sort()).toEqual(['current', 'divorced']);
  });

  it('§4.5.6 has half-siblings sharing exactly one parent', () => {
    const shared = parentIds(p.karan.id).filter((id) => parentIds(p.ravi.id).includes(id));
    expect(shared).toEqual([p.vikram.id]);
  });

  it('§4.5.7 has a step-child: a partner’s child from a prior union', () => {
    expect(parentIds(p.ethan.id)).toContain(p.priya.id);
    expect(parentIds(p.ethan.id)).not.toContain(p.ravi.id);
    expect(u.raviPriya.partnerBId).toBe(p.priya.id);
  });

  it('§4.5.8 has adoption and foster, distinct from biological', () => {
    const kinds = index.childEdgesOf(u.sureshAlone.id).map((edge) => edge.kind).sort();
    expect(kinds).toEqual(['adopted', 'foster']);
  });

  it('§4.5.9–10 has aunts and uncles (with partners) and their children as first cousins', () => {
    const auntsAndUncles = childIds(u.mohanSita.id).filter((id) => id !== p.vikram.id);
    expect(auntsAndUncles.sort()).toEqual([p.anita.id, p.suresh.id].sort());
    expect(index.partnersOf(p.anita.id).map((link) => link.partnerId)).toContain(p.tom.id);
    expect(parentIds(p.lukas.id)).toEqual([p.anita.id, p.tom.id].sort());
  });

  it('§4.5.11 has second cousins and once-removed, four generations deep on a collateral line', () => {
    // Hari → Leela → Meera → Arjun → Ishaan  versus  Hari → Mohan → Vikram → Ravi.
    expect(parentIds(p.meera.id)).toContain(p.leela.id);
    expect(parentIds(p.arjun.id)).toContain(p.meera.id);
    expect(parentIds(p.ishaan.id)).toContain(p.arjun.id);
    expect(parentIds(p.leela.id)).toContain(p.hari.id);
  });

  it('§4.5.12 has nieces and nephews (children of siblings)', () => {
    expect(parentIds(p.mia.id)).toContain(p.asha.id);
    expect(parentIds(p.ruby.id)).toContain(p.karan.id);
  });

  it('§4.5.13 has grandparents and great-grandparents above the focus person', () => {
    expect(parentIds(p.vikram.id)).toContain(p.mohan.id);
    expect(parentIds(p.mohan.id)).toContain(p.hari.id);
  });

  it('§4.5.14 has a full in-law branch whose root connects only through a union', () => {
    expect(parentIds(p.nisha.id)).toEqual([p.gopal.id, p.lakshmi.id].sort());
    expect(parentIds(p.gopal.id)).toEqual([]);
    expect(index.childrenOf(p.kiran.id).length).toBeGreaterThan(0);
  });

  it('§4.5.15 has twins: same union, same full birth date', () => {
    expect(p.dev.birthDate).toEqual(p.diya.birthDate);
    expect(p.dev.birthDate?.day).not.toBeNull();
    expect(parentIds(p.dev.id)).toEqual(parentIds(p.diya.id));
  });

  it('§4.5.16 has deceased members across several generations', () => {
    const deceased = graph.people.filter((person) => person.lifeStatus === 'deceased').map((person) => person.id);
    for (const person of [p.hari, p.kamala, p.mohan, p.leela, p.gopal]) expect(deceased).toContain(person.id);
  });

  it('§4.5.17 has a cousin reachable only through two unnamed placeholders', () => {
    expect(p.radhaParent.isPlaceholder && p.radhaSibling.isPlaceholder).toBe(true);
    expect(parentIds(p.sanjay.id)).toEqual([p.radhaSibling.id]);
    expect(parentIds(p.radhaSibling.id)).toEqual([p.radhaParent.id]);
    expect(parentIds(p.radha.id)).toEqual([p.radhaParent.id]);
  });

  it('§4.5.18 has disconnected components', () => {
    const components = connectedComponents(graph);
    expect(components.length).toBe(3);
    const walkers = components.find((component) => component.includes(p.george.id));
    expect(walkers?.sort()).toEqual([p.george.id, p.helen.id, p.grace.id].sort());
  });
});

describe('large tree fixture (§4.5.19)', () => {
  it('has 500 people over six generations and is valid', () => {
    const graph = buildLargeTree();
    expect(graph.people).toHaveLength(500);
    expect(generationDepth(graph)).toBe(6);
    expect(validateGraph(graph)).toEqual([]);
  });

  it('is deterministic', () => {
    expect(buildLargeTree()).toEqual(buildLargeTree());
  });
});
