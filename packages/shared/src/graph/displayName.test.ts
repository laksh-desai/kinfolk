import { describe, expect, it } from 'vitest';
import { FixtureBuilder } from '../fixtures/fixtureBuilder';
import { buildSeedTree } from '../fixtures/seedTree';
import { displayName, fullName } from './displayName';
import { indexGraph } from './graphIndex';

describe('displayName', () => {
  it('uses the full name for named people', () => {
    const { graph, people } = buildSeedTree();
    expect(displayName(indexGraph(graph), people.ravi.id)).toBe('Ravi Sharma');
    expect(fullName({ firstName: 'Robert', lastName: 'Hale', suffix: 'Jr.', isPlaceholder: false })).toBe('Robert Hale Jr.');
  });

  it('describes placeholders by their nearest named relative, derived from the graph (SPEC §4.2)', () => {
    const { graph, people } = buildSeedTree();
    const index = indexGraph(graph);
    expect(displayName(index, people.radhaParent.id)).toBe('Radha’s parent — unnamed');
    expect(displayName(index, people.radhaSibling.id)).toBe('Sanjay’s parent — unnamed');
  });

  it('falls back through partner, child, and sibling relationships', () => {
    const b = new FixtureBuilder(3);
    const ravi = b.person('Ravi');
    const partner = b.placeholder();
    b.union(ravi, partner);
    const parent = b.person('Deval');
    const child = b.placeholder();
    const sibling = b.person('Arjun');
    b.family(parent, null, [child, sibling]);
    const lonely = b.placeholder();
    const index = indexGraph(b.build());
    expect(displayName(index, partner.id)).toBe('Ravi’s partner — unnamed');
    expect(displayName(index, child.id)).toBe('Deval’s child — unnamed');
    expect(displayName(index, lonely.id)).toBe('Family member — unnamed');
  });

  it('updates automatically when the graph changes — nothing is stored', () => {
    const b = new FixtureBuilder(4);
    const unnamed = b.placeholder();
    const james = b.person('James');
    b.family(unnamed, null, [james]);
    const graph = b.build();
    const renamed = { ...graph, people: graph.people.map((person) => (person.id === james.id ? { ...person, firstName: 'Jim' } : person)) };
    expect(displayName(indexGraph(renamed), unnamed.id)).toBe('Jim’s parent — unnamed');
  });
});
