import { describe, expect, it } from 'vitest';
import { buildLargeTree } from '../fixtures/largeTree';
import { buildSeedTree } from '../fixtures/seedTree';
import { createKinshipResolver } from './resolveKinship';

const { graph, people: p } = buildSeedTree();

/**
 * What every person in the seed family is to Ravi, the focus person. Written by hand from
 * the family diagram in seedTree.ts — not generated — so a regression in any rule shows up.
 */
const RAVI_TO_EVERYONE: Record<keyof typeof p, string> = {
  ravi: 'Self',
  hari: 'Paternal great-grandfather',
  kamala: 'Paternal great-grandmother',
  mohan: 'Paternal grandfather',
  sita: 'Paternal grandmother',
  leela: 'Paternal great-aunt',
  arun: 'Paternal great-uncle by marriage',
  vikram: 'Father',
  nisha: 'Mother',
  anita: 'Paternal aunt',
  tom: 'Paternal uncle by marriage',
  suresh: 'Paternal uncle',
  meera: 'First cousin once removed',
  raj: 'First cousin once removed’s husband',
  priti: 'Father’s former wife',
  karan: 'Half-brother',
  olivia: 'Half-brother’s wife',
  ruby: 'Half-niece',
  gopal: 'Maternal grandfather',
  lakshmi: 'Maternal grandmother',
  kiran: 'Maternal uncle',
  fatima: 'Maternal aunt by marriage',
  zara: 'First cousin',
  rohan: 'First cousin',
  asha: 'Sister',
  james: 'Sister’s partner',
  mia: 'Niece',
  oliver: 'Nephew',
  dev: 'Brother',
  diya: 'Sister',
  marco: 'Brother-in-law',
  luca: 'Nephew',
  lukas: 'First cousin',
  sofia: 'First cousin’s partner',
  noah: 'First cousin once removed',
  emma: 'First cousin',
  hannah: 'First cousin’s wife',
  maya: 'First cousin',
  leo: 'Related — 4 steps away',
  arjun: 'Second cousin',
  kavya: 'Second cousin’s wife',
  ishaan: 'Second cousin once removed',
  priya: 'Wife',
  mahesh: 'Father-in-law',
  radha: 'Mother-in-law',
  divya: 'Sister-in-law',
  sam: 'Wife’s sister’s husband',
  ada: 'Wife’s niece',
  kofi: 'Wife’s nephew',
  daniel: 'Wife’s former husband',
  ethan: 'Step-son',
  aarav: 'Son',
  anika: 'Daughter',
  radhaParent: 'Grandparent-in-law',
  radhaSibling: 'Wife’s mother’s sibling',
  sanjay: 'Wife’s first cousin',
  george: 'No known relationship',
  helen: 'No known relationship',
  grace: 'No known relationship',
  samuel: 'No known relationship',
};

describe('seed tree kinship', () => {
  const resolve = createKinshipResolver(graph);

  it('labels every person in the seed tree correctly relative to the focus person', () => {
    const actual = Object.fromEntries(Object.entries(p).map(([key, person]) => [key, resolve(p.ravi.id, person.id).label]));
    expect(actual).toEqual(RAVI_TO_EVERYONE);
  });

  it('covers every person in the seed tree in the curated table', () => {
    expect(Object.keys(RAVI_TO_EVERYONE).length).toBe(graph.people.length);
  });

  it('spot-checks relationships from other people’s point of view', () => {
    expect(resolve(p.nisha.id, p.karan.id).label).toBe('Step-son');
    expect(resolve(p.karan.id, p.nisha.id).label).toBe('Step-mother');
    expect(resolve(p.suresh.id, p.leo.id).label).toBe('Foster son');
    expect(resolve(p.suresh.id, p.maya.id).label).toBe('Adopted daughter');
    expect(resolve(p.maya.id, p.sita.id).label).toBe('Paternal grandmother');
    expect(resolve(p.ishaan.id, p.ravi.id).label).toBe('Second cousin once removed');
    expect(resolve(p.priya.id, p.sanjay.id).label).toBe('First cousin');
    expect(resolve(p.sanjay.id, p.radha.id).label).toBe('Aunt');
    expect(resolve(p.mahesh.id, p.ravi.id).label).toBe('Son-in-law');
    expect(resolve(p.dev.id, p.diya.id).label).toBe('Sister');
    expect(resolve(p.lakshmi.id, p.aarav.id).label).toBe('Great-grandson');
    expect(resolve(p.ethan.id, p.ravi.id).label).toBe('Step-father');
    expect(resolve(p.ethan.id, p.aarav.id).label).toBe('Half-brother');
  });

  it('resolves every ordered pair without throwing, to a non-empty label', () => {
    let pairs = 0;
    for (const ego of graph.people) {
      for (const alter of graph.people) {
        const kinship = resolve(ego.id, alter.id);
        expect(kinship.label.trim()).not.toBe('');
        pairs += 1;
      }
    }
    expect(pairs).toBe(graph.people.length ** 2);
  });

  it('draws a connected path from ego to alter for every related pair', () => {
    const unions = new Map(graph.unions.map((union) => [union.id, union]));
    const linked = new Set<string>();
    const link = (a: string, b: string) => {
      linked.add(`${a}|${b}`);
      linked.add(`${b}|${a}`);
    };
    for (const union of graph.unions) if (union.partnerBId) link(union.partnerAId, union.partnerBId);
    for (const edge of graph.parentChildren) {
      const union = unions.get(edge.unionId)!;
      link(union.partnerAId, edge.childId);
      if (union.partnerBId) link(union.partnerBId, edge.childId);
    }
    const problems: string[] = [];
    for (const ego of graph.people) {
      for (const alter of graph.people) {
        const { path, category, steps } = resolve(ego.id, alter.id);
        if (category === 'none') continue;
        if (path[0] !== ego.id || path[path.length - 1] !== alter.id) problems.push(`${ego.firstName}→${alter.firstName}: wrong ends`);
        if (steps !== path.length - 1) problems.push(`${ego.firstName}→${alter.firstName}: steps`);
        for (let i = 1; i < path.length; i += 1) {
          if (!linked.has(`${path[i - 1]}|${path[i]}`)) problems.push(`${ego.firstName}→${alter.firstName}: gap at ${i}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('is deterministic and fast enough to label every card on a 500-person canvas', () => {
    expect(createKinshipResolver(graph)(p.ravi.id, p.ishaan.id)).toEqual(resolve(p.ravi.id, p.ishaan.id));
    const large = buildLargeTree();
    const focus = large.people[0]!.id;
    const started = performance.now();
    const largeResolve = createKinshipResolver(large);
    for (const person of large.people) largeResolve(focus, person.id);
    expect(performance.now() - started).toBeLessThan(1500);
  });
});
