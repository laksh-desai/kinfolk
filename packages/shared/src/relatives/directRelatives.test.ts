import { describe, expect, it } from 'vitest';
import { buildSeedTree } from '../fixtures/seedTree';
import { indexGraph } from '../graph/graphIndex';
import { createKinshipResolver } from '../kinship/resolveKinship';
import { directRelatives } from './directRelatives';

describe('directRelatives (SPEC §5.4 relationships list)', () => {
  const { graph, people, unions } = buildSeedTree();
  const index = indexGraph(graph);
  const resolve = createKinshipResolver(graph);
  const nameOf = (id: string) => index.person(id)?.firstName;
  const summarise = (entries: Array<{ personId: string; label: string; detail: string | null }>) =>
    entries.map((entry) => `${entry.label}: ${nameOf(entry.personId)}${entry.detail ? ` (${entry.detail})` : ''}`).sort();

  it('lists Ravi’s parents, partner, children, and siblings, labelled from his side', () => {
    const ravi = directRelatives(index, resolve, people.ravi.id);
    expect(ravi.parentFamilies).toHaveLength(1);
    expect(summarise(ravi.parentFamilies[0]?.parents ?? [])).toEqual(['Father: Vikram', 'Mother: Nisha']);
    expect(summarise(ravi.partners)).toEqual(['Wife: Priya (m. 2011)']);
    expect(ravi.childFamilies.map((family) => family.union.id)).toEqual([unions.raviPriya.id]);
    expect(summarise(ravi.childFamilies[0]?.children ?? [])).toEqual(['Daughter: Anika', 'Son: Aarav']);
    expect(summarise(ravi.siblings)).toEqual(['Brother: Dev', 'Half-brother: Karan', 'Sister: Asha', 'Sister: Diya']);
  });

  it('shows ended unions and non-biological links in words', () => {
    const vikram = directRelatives(index, resolve, people.vikram.id);
    expect(summarise(vikram.partners)).toEqual(['Former wife: Priti (m. 1980, divorced 1985)', 'Wife: Nisha (m. 1986)']);
    const suresh = directRelatives(index, resolve, people.suresh.id);
    expect(suresh.childFamilies).toHaveLength(1);
    expect(suresh.childFamilies[0]?.partner).toBeNull();
    expect(summarise(suresh.childFamilies[0]?.children ?? [])).toEqual(['Adopted daughter: Maya (adopted)', 'Foster son: Leo (foster)']);
  });

  it('returns nothing for a detached person', () => {
    expect(directRelatives(index, resolve, people.samuel.id)).toEqual({ parentFamilies: [], partners: [], childFamilies: [], siblings: [] });
  });
});
