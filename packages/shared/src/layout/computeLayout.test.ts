import { describe, expect, it } from 'vitest';
import { FixtureBuilder } from '../fixtures/fixtureBuilder';
import { buildLargeTree } from '../fixtures/largeTree';
import { buildSeedTree } from '../fixtures/seedTree';
import type { TreeGraph } from '../schemas/graph';
import { computeLayout } from './computeLayout';
import { isAxisAligned, pathEntersRect, rectsOverlap } from './geometry';
import type { LayoutResult } from './layoutTypes';

/** Deterministic Fisher–Yates shuffle so "any input order" is actually exercised. */
function shuffled<T>(items: T[], seed: number): T[] {
  const copy = [...items];
  let state = seed;
  for (let i = copy.length - 1; i > 0; i -= 1) {
    state = (state * 1103515245 + 12345) % 2147483648;
    const j = state % (i + 1);
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}

/**
 * The invariants every layout must satisfy:
 * - every visible person has exactly one card, and no two cards overlap;
 * - every connector is orthogonal and never passes through a card;
 * - edges start at their union's anchor and end on the child's card;
 * - partners share a row, children sit below parents;
 * - output is identical for shuffled input.
 */
function expectValidLayout(graph: TreeGraph, layout: LayoutResult = computeLayout(graph), options: { childrenBelowParents?: boolean } = {}) {
  const ids = graph.people.map((person) => person.id).sort();
  expect(layout.nodes.map((node) => node.personId).sort()).toEqual(ids);

  const problems: string[] = [];
  for (let i = 0; i < layout.nodes.length; i += 1) {
    for (let j = i + 1; j < layout.nodes.length; j += 1) {
      const a = layout.nodes[i]!;
      const b = layout.nodes[j]!;
      if (rectsOverlap(a, b)) problems.push(`cards overlap: ${a.personId} / ${b.personId}`);
    }
  }

  const node = new Map(layout.nodes.map((entry) => [entry.personId, entry]));
  const paths = [
    ...layout.unions.map((union) => ({ label: `union ${union.unionId}`, path: union.path })),
    ...layout.edges.map((edge) => ({ label: `edge ${edge.parentChildId}`, path: edge.path })),
  ];
  for (const { label, path } of paths) {
    for (let index = 1; index < path.length; index += 1) {
      if (!isAxisAligned(path[index - 1]!, path[index]!)) problems.push(`${label} has a diagonal segment`);
    }
    for (const card of layout.nodes) {
      if (pathEntersRect(path, card)) problems.push(`${label} passes through ${card.personId}`);
    }
  }
  expect(problems).toEqual([]);

  const unionLayout = new Map(layout.unions.map((union) => [union.unionId, union]));
  for (const edge of layout.edges) {
    const first = edge.path[0]!;
    const last = edge.path[edge.path.length - 1]!;
    expect(first).toEqual(unionLayout.get(edge.unionId)?.anchor);
    const child = node.get(edge.childId)!;
    expect(last.x).toBe(child.x + child.width / 2);
    expect([child.y, child.y + child.height]).toContain(last.y);
  }

  for (const union of graph.unions) {
    if (union.partnerBId) expect(node.get(union.partnerAId)?.y).toBe(node.get(union.partnerBId)?.y);
  }
  if (options.childrenBelowParents !== false) {
    const unionById = new Map(graph.unions.map((union) => [union.id, union]));
    for (const edge of graph.parentChildren) {
      const union = unionById.get(edge.unionId)!;
      expect(node.get(edge.childId)!.y, `child ${edge.childId} not below parent`).toBeGreaterThan(node.get(union.partnerAId)!.y);
    }
  }

  const reshuffled = computeLayout({
    people: shuffled(graph.people, 7),
    unions: shuffled(graph.unions, 11),
    parentChildren: shuffled(graph.parentChildren, 13),
    focusPersonId: graph.focusPersonId,
  });
  expect(reshuffled).toEqual(layout);
  return layout;
}

const centreX = (layout: LayoutResult, id: string) => {
  const node = layout.nodes.find((entry) => entry.personId === id)!;
  return node.x + node.width / 2;
};
const nodeOf = (layout: LayoutResult, id: string) => layout.nodes.find((entry) => entry.personId === id)!;
const anchorOf = (layout: LayoutResult, unionId: string) => layout.unions.find((union) => union.unionId === unionId)!.anchor;

describe('§4.5.1 a single person with no relationships', () => {
  it('draws one card at the origin and nothing else', () => {
    const b = new FixtureBuilder();
    const solo = b.person('Samuel', 'Osei');
    const layout = expectValidLayout(b.build());
    expect(layout.nodes).toEqual([expect.objectContaining({ personId: solo.id, x: 0, y: 0, generation: 0, hasDescendants: false })]);
    expect(layout.edges).toEqual([]);
    expect(layout.bounds).toEqual({ x: 0, y: 0, width: 224, height: 96 });
  });

  it('handles an empty tree', () => {
    const layout = computeLayout({ people: [], unions: [], parentChildren: [], focusPersonId: null });
    expect(layout.nodes).toEqual([]);
    expect(layout.bounds).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});

describe('§4.5.2 a couple with no children', () => {
  it('puts partners side by side, joined by a horizontal connector between the cards', () => {
    const b = new FixtureBuilder();
    const emma = b.person('Emma');
    const hannah = b.person('Hannah');
    const union = b.union(emma, hannah);
    const layout = expectValidLayout(b.build());
    const [left, right] = [nodeOf(layout, emma.id), nodeOf(layout, hannah.id)].sort((a, c) => a.x - c.x);
    expect(right!.x - (left!.x + left!.width)).toBe(44);
    const path = layout.unions.find((entry) => entry.unionId === union.id)!.path;
    expect(path).toEqual([
      { x: left!.x + left!.width, y: left!.y + 48 },
      { x: right!.x, y: left!.y + 48 },
    ]);
  });
});

describe('§4.5.3 a couple with children', () => {
  it('centres the children beneath the midpoint of the union connector', () => {
    const b = new FixtureBuilder();
    const mohan = b.person('Mohan', null, { gender: 'male' });
    const sita = b.person('Sita', null, { gender: 'female' });
    const kids = [b.person('Vikram', null, { born: [1958] }), b.person('Anita', null, { born: [1961] }), b.person('Suresh', null, { born: [1964] })];
    const union = b.family(mohan, sita, kids);
    const layout = expectValidLayout(b.build());
    const centres = kids.map((kid) => centreX(layout, kid.id));
    expect((Math.min(...centres) + Math.max(...centres)) / 2).toBeCloseTo(anchorOf(layout, union.id).x, 0);
    expect(centres).toEqual([...centres].sort((a, c) => a - c));
  });

  it('orders siblings by birth date with unknown dates last, regardless of entry order', () => {
    const b = new FixtureBuilder();
    const parent = b.person('Parent');
    const unknown = b.person('Unknown');
    const youngest = b.person('Youngest', null, { born: [2001] });
    const eldest = b.person('Eldest', null, { born: [1990, 5] });
    b.family(parent, null, [unknown, youngest, eldest]);
    const layout = expectValidLayout(b.build());
    const order = [eldest, youngest, unknown].map((person) => centreX(layout, person.id));
    expect(order).toEqual([...order].sort((a, c) => a - c));
  });
});

describe('§4.5.4 a single parent with children', () => {
  it('centres children under the parent’s card', () => {
    const b = new FixtureBuilder();
    const suresh = b.person('Suresh');
    const kids = [b.person('Maya', null, { born: [2000] }), b.person('Leo', null, { born: [2008] })];
    const union = b.family(suresh, null, kids);
    const layout = expectValidLayout(b.build());
    expect(anchorOf(layout, union.id)).toEqual({ x: centreX(layout, suresh.id), y: 96 });
    expect((centreX(layout, kids[0]!.id) + centreX(layout, kids[1]!.id)) / 2).toBeCloseTo(centreX(layout, suresh.id), 0);
  });
});

describe('§4.5.5 remarriage', () => {
  it('draws both unions around the shared partner, the divorced one dashed, children under each', () => {
    const b = new FixtureBuilder();
    const vikram = b.person('Vikram');
    const priti = b.person('Priti');
    const nisha = b.person('Nisha');
    const karan = b.person('Karan', null, { born: [1982] });
    const ravi = b.person('Ravi', null, { born: [1988] });
    const first = b.family(vikram, priti, [karan], { status: 'divorced', start: [1980] });
    const second = b.family(vikram, nisha, [ravi], { start: [1986] });
    const layout = expectValidLayout(b.build());
    expect(nodeOf(layout, priti.id).x).toBeLessThan(nodeOf(layout, vikram.id).x);
    expect(nodeOf(layout, nisha.id).x).toBeGreaterThan(nodeOf(layout, vikram.id).x);
    expect(layout.unions.find((union) => union.unionId === first.id)?.style).toBe('dashed');
    expect(layout.unions.find((union) => union.unionId === second.id)?.style).toBe('solid');
    expect(centreX(layout, karan.id)).toBeLessThan(centreX(layout, ravi.id));
    expect(Math.abs(centreX(layout, karan.id) - anchorOf(layout, first.id).x)).toBeLessThan(Math.abs(centreX(layout, karan.id) - anchorOf(layout, second.id).x));
  });

  it('handles three partners, routing the non-adjacent union below the row', () => {
    const b = new FixtureBuilder();
    const hub = b.person('Hub');
    const partners = [b.person('First'), b.person('Second'), b.person('Third')];
    partners.forEach((partner, index) => b.family(hub, partner, [b.person(`Child ${index}`)], { start: [1980 + index * 5] }));
    const layout = expectValidLayout(b.build());
    const belowRow = layout.unions.filter((union) => union.path.length === 4);
    expect(belowRow.length).toBeGreaterThanOrEqual(1);
    for (const union of belowRow) expect(union.anchor.y).toBeGreaterThan(nodeOf(layout, hub.id).y + 96);
  });
});

describe('§4.5.6 half-siblings', () => {
  it('keeps each union’s children under it but adjacent to their half-siblings', () => {
    const { graph, people, unions } = buildSeedTree();
    const layout = expectValidLayout(graph);
    const row = layout.nodes.filter((entry) => entry.y === nodeOf(layout, people.karan.id).y).sort((a, c) => a.x - c.x).map((entry) => entry.personId);
    const karanGroupEnd = row.indexOf(people.olivia.id);
    const raviGroupStart = row.indexOf(people.ravi.id);
    expect(karanGroupEnd).toBeGreaterThanOrEqual(0);
    expect(raviGroupStart).toBe(karanGroupEnd + 1);
    expect(centreX(layout, people.karan.id)).toBeLessThan(anchorOf(layout, unions.vikramNisha.id).x);
  });
});

describe('§4.5.7 step-family', () => {
  it('puts a partner’s child from a prior union under that union, beside the current family', () => {
    const { graph, people } = buildSeedTree();
    const layout = expectValidLayout(graph);
    const priyaDaniel = graph.unions.find((union) => union.partnerAId === people.priya.id && union.partnerBId === people.daniel.id)!;
    const raviPriya = graph.unions.find((union) => union.partnerAId === people.ravi.id && union.partnerBId === people.priya.id)!;
    const ethanX = centreX(layout, people.ethan.id);
    expect(Math.abs(ethanX - anchorOf(layout, priyaDaniel.id).x)).toBeLessThan(Math.abs(ethanX - anchorOf(layout, raviPriya.id).x));
    expect(nodeOf(layout, people.priya.id).x).toBeGreaterThan(nodeOf(layout, people.ravi.id).x);
    expect(nodeOf(layout, people.daniel.id).x).toBeGreaterThan(nodeOf(layout, people.priya.id).x);
  });
});

describe('§4.5.8 adoption and foster', () => {
  it('labels non-biological edges with their kind and a distinct line style', () => {
    const { graph, people } = buildSeedTree();
    const layout = expectValidLayout(graph);
    const maya = layout.edges.find((edge) => edge.childId === people.maya.id)!;
    const leo = layout.edges.find((edge) => edge.childId === people.leo.id)!;
    const ravi = layout.edges.find((edge) => edge.childId === people.ravi.id)!;
    expect([maya.kind, maya.style]).toEqual(['adopted', 'dashed']);
    expect([leo.kind, leo.style]).toEqual(['foster', 'dotted']);
    expect([ravi.kind, ravi.style]).toEqual(['biological', 'solid']);
  });
});

describe('§4.5.9–12 aunts and uncles, cousins, second cousins once removed, nieces and nephews', () => {
  const { graph, people } = buildSeedTree();
  const layout = expectValidLayout(graph);
  const generation = (id: string) => nodeOf(layout, id).generation;

  it('puts aunts and uncles (and their partners) on the parents’ row', () => {
    for (const person of [people.anita, people.tom, people.suresh, people.kiran, people.fatima]) {
      expect(generation(person.id)).toBe(generation(people.vikram.id));
    }
  });

  it('puts first cousins, second cousins, and siblings on the focus person’s row', () => {
    for (const person of [people.lukas, people.emma, people.zara, people.arjun, people.asha]) {
      expect(generation(person.id)).toBe(generation(people.ravi.id));
    }
  });

  it('puts once-removed cousins, nieces, and nephews one row below', () => {
    for (const person of [people.ishaan, people.noah, people.mia, people.oliver, people.ruby]) {
      expect(generation(person.id)).toBe(generation(people.ravi.id) + 1);
    }
  });
});

describe('§4.5.13 grandparents and great-grandparents', () => {
  it('stacks each generation strictly above the next', () => {
    const { graph, people } = buildSeedTree();
    const layout = expectValidLayout(graph);
    const line = [people.hari, people.mohan, people.vikram, people.ravi, people.aarav].map((person) => nodeOf(layout, person.id));
    expect(line.map((entry) => entry.generation)).toEqual([0, 1, 2, 3, 4]);
    for (let index = 1; index < line.length; index += 1) expect(line[index]!.y).toBeGreaterThan(line[index - 1]!.y);
  });
});

describe('§4.5.14 a full in-law branch', () => {
  it('places the spouse’s parents one row above the spouse, as their own branch, not overlapping', () => {
    const { graph, people } = buildSeedTree();
    const layout = expectValidLayout(graph);
    expect(nodeOf(layout, people.gopal.id).generation).toBe(nodeOf(layout, people.nisha.id).generation - 1);
    expect(nodeOf(layout, people.mahesh.id).generation).toBe(nodeOf(layout, people.priya.id).generation - 1);
    expect(nodeOf(layout, people.divya.id).generation).toBe(nodeOf(layout, people.priya.id).generation);
    const raoBranch = layout.branches.find((branch) => branch.personIds.includes(people.gopal.id))!;
    const sharmaBranch = layout.branches.find((branch) => branch.personIds.includes(people.hari.id))!;
    expect(raoBranch.id).not.toBe(sharmaBranch.id);
    expect(raoBranch.componentIndex).toBe(sharmaBranch.componentIndex);
    expect(raoBranch.personIds).not.toContain(people.nisha.id);
  });
});

describe('§4.5.15 twins', () => {
  it('keeps twins adjacent and marks them with a shared multiple-birth id', () => {
    const { graph, people } = buildSeedTree();
    const layout = expectValidLayout(graph);
    const dev = nodeOf(layout, people.dev.id);
    const diya = nodeOf(layout, people.diya.id);
    expect(dev.multipleBirthId).not.toBeNull();
    expect(dev.multipleBirthId).toBe(diya.multipleBirthId);
    expect(nodeOf(layout, people.ravi.id).multipleBirthId).toBeNull();
    const row = layout.nodes.filter((entry) => entry.y === dev.y && entry.multipleBirthId === null).map((entry) => entry.x);
    expect(row.some((x) => x > Math.min(dev.x, diya.x) && x < Math.max(dev.x, diya.x) && x !== nodeOf(layout, people.marco.id).x)).toBe(false);
  });
});

describe('§4.5.16 deceased members across generations', () => {
  it('lays out the deceased exactly like the living', () => {
    const { graph, people } = buildSeedTree();
    const layout = expectValidLayout(graph);
    for (const person of [people.hari, people.kamala, people.mohan, people.leela, people.arun, people.gopal]) {
      expect(nodeOf(layout, person.id)).toBeDefined();
    }
  });
});

describe('§4.5.17 placeholder-only connectors', () => {
  it('routes a cousin through two unnamed placeholders like anyone else', () => {
    const { graph, people } = buildSeedTree();
    const layout = expectValidLayout(graph);
    const toSanjay = layout.edges.find((edge) => edge.childId === people.sanjay.id)!;
    expect(toSanjay.path.length).toBeGreaterThanOrEqual(2);
    expect(nodeOf(layout, people.radhaSibling.id).generation).toBe(nodeOf(layout, people.radha.id).generation);
    expect(nodeOf(layout, people.sanjay.id).generation).toBe(nodeOf(layout, people.priya.id).generation);
  });
});

describe('§4.5.18 disconnected components', () => {
  it('renders every component side by side without overlap, each starting at row 0', () => {
    const { graph, people } = buildSeedTree();
    const layout = expectValidLayout(graph);
    const walkers = layout.branches.find((branch) => branch.personIds.includes(people.george.id))!;
    const samuel = layout.branches.find((branch) => branch.personIds.includes(people.samuel.id))!;
    const main = layout.branches.filter((branch) => branch.componentIndex !== walkers.componentIndex && branch.componentIndex !== samuel.componentIndex);
    expect(new Set(layout.branches.map((branch) => branch.componentIndex)).size).toBe(3);
    expect(nodeOf(layout, people.george.id).generation).toBe(0);
    expect(nodeOf(layout, people.samuel.id).generation).toBe(0);
    const mainRight = Math.max(...main.map((branch) => branch.bounds.x + branch.bounds.width));
    expect(walkers.bounds.x).toBeGreaterThan(mainRight);
    expect(samuel.bounds.x).toBeGreaterThan(walkers.bounds.x + walkers.bounds.width);
  });

  it('lays out a detached person added to an existing family', () => {
    const b = new FixtureBuilder();
    const parent = b.person('Parent');
    b.family(parent, null, [b.person('Child')]);
    b.person('Detached');
    expectValidLayout(b.build());
  });
});

describe('§4.5.19 a 500-person tree over six generations', () => {
  it('lays out quickly and satisfies every invariant', () => {
    const graph = buildLargeTree();
    computeLayout(graph);
    const started = performance.now();
    const layout = computeLayout(graph);
    const elapsed = performance.now() - started;
    expect(elapsed).toBeLessThan(300);
    expectValidLayout(graph, layout);
    expect(new Set(layout.nodes.map((node) => node.generation)).size).toBe(6);
  }, 60_000);
});

describe('odd but legal data', () => {
  it('survives a partnership that joins two generations (a cycle between partner groups)', () => {
    const b = new FixtureBuilder();
    const elder = b.person('Elder');
    const elderPartner = b.person('Elder partner');
    const middle = b.person('Middle');
    const middlePartner = b.person('Middle partner');
    const young = b.person('Young');
    b.family(elder, elderPartner, [middle]);
    b.family(middle, middlePartner, [young]);
    b.union(elder, young, { type: 'partnership' });
    const layout = expectValidLayout(b.build(), undefined, { childrenBelowParents: false });
    expect(nodeOf(layout, elder.id).y).toBe(nodeOf(layout, young.id).y);
  });

  it('survives a person with biological and adoptive parents in different families', () => {
    const { graph, people } = buildSeedTree();
    const adoptive = graph.unions.find((union) => union.partnerAId === people.suresh.id)!;
    const withAdoption: TreeGraph = {
      ...graph,
      parentChildren: [...graph.parentChildren, { id: '00005eed-0000-4000-8000-00000000ffff', unionId: adoptive.id, childId: people.ethan.id, kind: 'adopted', createdAt: '2026-06-01T00:00:00.000Z' }],
    };
    expectValidLayout(withAdoption);
  });

  it('survives a cousin marriage (pedigree collapse)', () => {
    const b = new FixtureBuilder();
    const g1 = b.person('Grandpa');
    const g2 = b.person('Grandma');
    const a = b.person('Aunt', null, { born: [1950] });
    const u = b.person('Uncle', null, { born: [1952] });
    b.family(g1, g2, [a, u]);
    const cousinA = b.person('Cousin A');
    const cousinB = b.person('Cousin B');
    b.family(a, b.person('Aunt partner'), [cousinA]);
    b.family(u, b.person('Uncle partner'), [cousinB]);
    b.family(cousinA, cousinB, [b.person('Child of cousins')]);
    expectValidLayout(b.build());
  });
});

describe('the seed tree as a whole', () => {
  it('satisfies every invariant and is stable across calls', () => {
    const { graph } = buildSeedTree();
    expect(computeLayout(graph)).toEqual(expectValidLayout(graph));
  });
});

/**
 * Shuffling the arrays isn't enough: the engine sorts by createdAt first, so entering the same
 * family in a different order is what actually changes the input. Re-stamps createdAt in a
 * shuffled order, keeping ids, dates, and every relationship.
 */
function reentered(graph: TreeGraph, seed: number): TreeGraph {
  const stamp = <T extends { createdAt: string }>(list: readonly T[], salt: number): T[] =>
    shuffled([...list], seed * 31 + salt).map((item, index) => ({ ...item, createdAt: new Date(Date.UTC(2020, 0, 1) + index * 60_000).toISOString() }));
  return { ...graph, people: stamp(graph.people, 1), unions: stamp(graph.unions, 2), parentChildren: stamp(graph.parentChildren, 3) };
}

describe('entry order (SPEC §4.5: the same family always draws the same way)', () => {
  /** Three generations, an in-law branch, a remarriage, and someone not yet connected. */
  function datedFamily() {
    const b = new FixtureBuilder(71);
    const mohan = b.person('Mohan', 'Sharma', { gender: 'male', born: [1930, 6, 1] });
    const sita = b.person('Sita', 'Sharma', { gender: 'female', born: [1934, 2, 2] });
    const vikram = b.person('Vikram', 'Sharma', { gender: 'male', born: [1958, 1, 9] });
    const nisha = b.person('Nisha', 'Sharma', { gender: 'female', born: [1960, 5, 5] });
    const priti = b.person('Priti', 'Kapoor', { gender: 'female', born: [1959, 7, 7] });
    const karan = b.person('Karan', 'Sharma', { gender: 'male', born: [1983, 8, 4] });
    const ravi = b.person('Ravi', 'Sharma', { gender: 'male', born: [1988, 4, 12] });
    const asha = b.person('Asha', 'Sharma', { gender: 'female', born: [1991, 11, 30] });
    const priya = b.person('Priya', 'Nair', { gender: 'female', born: [1990, 2, 17] });
    const gopal = b.person('Gopal', 'Nair', { gender: 'male', born: [1961, 3, 3] });
    const lakshmi = b.person('Lakshmi', 'Nair', { gender: 'female', born: [1963, 9, 20] });
    const aarav = b.person('Aarav', 'Sharma', { gender: 'male', born: [2015, 9, 9] });
    const anika = b.person('Anika', 'Sharma', { gender: 'female', born: [2019, 3, 2] });
    const stranger = b.person('Samuel', 'Osei', { gender: 'male', born: [1975, 5, 5] });
    b.family(mohan, sita, [vikram]);
    b.family(vikram, priti, [karan], { status: 'divorced', start: [1980, 1, 1] });
    b.family(vikram, nisha, [ravi, asha], { start: [1986, 6, 6] });
    b.family(gopal, lakshmi, [priya]);
    b.family(ravi, priya, [aarav, anika]);
    b.setFocus(ravi);
    return { graph: b.build(), ids: { ravi: ravi.id, karan: karan.id, asha: asha.id, stranger: stranger.id, mohan: mohan.id, priya: priya.id } };
  }

  it('puts every card in the same place however the family was entered', () => {
    const { graph } = datedFamily();
    const layout = computeLayout(graph);
    for (const seed of [1, 2, 3, 4, 5]) {
      expect(computeLayout(reentered(graph, seed)), `entry order ${seed}`).toEqual(layout);
    }
  });

  it('keeps the same width and the same row order for a 60-person tree', () => {
    const { graph } = buildSeedTree();
    const layout = computeLayout(graph);
    for (const seed of [1, 2, 3]) {
      const other = computeLayout(reentered(graph, seed));
      expect(other.bounds, `entry order ${seed}`).toEqual(layout.bounds);
      // Everyone keeps their row, and each row keeps its left-to-right order.
      const rowOf = (result: LayoutResult) =>
        result.nodes
          .slice()
          .sort((a, b) => a.generation - b.generation || a.x - b.x || (a.personId < b.personId ? -1 : 1))
          .map((node) => `${node.generation}:${node.personId}`);
      expect(rowOf(other), `entry order ${seed}`).toEqual(rowOf(layout));
    }
  });

  it('orders the parts of a tree by generation and age, not by when they were typed', () => {
    const { graph, ids } = datedFamily();
    const layout = computeLayout(graph);
    // Siblings read oldest-first, and the person not yet connected to anyone sits clear at the end.
    expect(centreX(layout, ids.karan)).toBeLessThan(centreX(layout, ids.ravi));
    expect(centreX(layout, ids.ravi)).toBeLessThan(centreX(layout, ids.asha));
    expect(centreX(layout, ids.stranger)).toBeGreaterThan(centreX(layout, ids.asha));
  });
});

describe('collapse', () => {
  it('hides a branch, reports how many are hidden, and keeps the rest valid', () => {
    const { graph, people } = buildSeedTree();
    const layout = computeLayout(graph, { collapsed: [people.vikram.id] });
    const visible = new Set(layout.nodes.map((node) => node.personId));
    for (const hidden of [people.ravi, people.karan, people.aarav, people.priya, people.mahesh, people.sanjay]) {
      expect(visible.has(hidden.id), hidden.firstName).toBe(false);
    }
    for (const kept of [people.vikram, people.nisha, people.priti, people.gopal, people.kiran, people.george]) {
      expect(visible.has(kept.id), kept.firstName).toBe(true);
    }
    const vikram = nodeOf(layout, people.vikram.id);
    expect(vikram.hiddenCount).toBe(graph.people.length - layout.nodes.length);
    const remaining = { ...graph, people: graph.people.filter((person) => visible.has(person.id)) };
    remaining.unions = graph.unions.filter((union) => visible.has(union.partnerAId) && (!union.partnerBId || visible.has(union.partnerBId)));
    const unionIds = new Set(remaining.unions.map((union) => union.id));
    remaining.parentChildren = graph.parentChildren.filter((edge) => visible.has(edge.childId) && unionIds.has(edge.unionId));
    expectValidLayout(remaining, computeLayout(remaining));
  });
});
