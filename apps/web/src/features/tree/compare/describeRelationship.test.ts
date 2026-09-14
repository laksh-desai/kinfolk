import { buildSeedTree } from '@kinfolk/shared/fixtures/seedTree';
import { resolveKinship } from '@kinfolk/shared/kinship/resolveKinship';
import { describeRelationship } from './describeRelationship';
import { describe, expect, it } from 'vitest';

describe('describeRelationship', () => {
  const { graph, people } = buildSeedTree();

  it('reads both directions as sentences', () => {
    expect(describeRelationship('Emma Becker', 'Ravi Sharma', resolveKinship(graph, people.ravi.id, people.emma.id))).toBe('Emma Becker is Ravi Sharma’s first cousin.');
    expect(describeRelationship('Ravi Sharma', 'Emma Becker', resolveKinship(graph, people.emma.id, people.ravi.id))).toBe('Ravi Sharma is Emma Becker’s first cousin.');
    expect(describeRelationship('Nisha Sharma', 'Lukas Becker', resolveKinship(graph, people.lukas.id, people.nisha.id))).toMatch(/^Nisha Sharma is Lukas Becker’s /);
  });

  it('says plainly when there is no relationship', () => {
    expect(describeRelationship('Samuel Osei', 'Ravi Sharma', resolveKinship(graph, people.ravi.id, people.samuel.id))).toBe('Samuel Osei and Ravi Sharma have no known relationship in this tree.');
  });
});
