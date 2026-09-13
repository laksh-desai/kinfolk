import { buildSeedTree } from '@kinfolk/shared/fixtures/seedTree';
import { REDACTED_PERSON_KEYS } from '@kinfolk/shared/schemas/person';
import { describe, expect, it } from 'vitest';
import { graphForVisibility } from './graphRows';

describe('graphForVisibility', () => {
  const { graph, people } = buildSeedTree();
  const ravi = people.ravi.id;
  const withPlanning = {
    ...graph,
    people: graph.people.map((person) =>
      person.id === ravi
        ? { ...person, planning: { overallObjective: 'Secret objective', areasOfConcern: null, marketOutlook: null, familyRelationships: null, rateOfReturnView: null }, notes: 'Private note' }
        : person,
    ),
  };

  it('redacted (share link) keeps only names, relationships, and birth years — an allow-list', () => {
    const redacted = graphForVisibility(withPlanning, 'redacted');
    const serialized = JSON.stringify(redacted);
    for (const secret of ['Secret objective', 'Private note', 'ravi.sharma@example.com', '+1 415 555 0142', 'Alder Street', 'Architect']) {
      expect(serialized).not.toContain(secret);
    }
    for (const person of redacted.people) expect(Object.keys(person).sort()).toEqual([...REDACTED_PERSON_KEYS].sort());
    expect(redacted.people.find((person) => person.id === ravi)).toMatchObject({ firstName: 'Ravi', birthYear: 1988 });
    expect(redacted.unions.every((union) => union.startDate === null && union.endDate === null)).toBe(true);
    expect(redacted.parentChildren).toHaveLength(graph.parentChildren.length);
  });

  it('standard (editor, viewer) removes the planning key entirely', () => {
    const standard = graphForVisibility(withPlanning, 'standard');
    expect(standard.people.every((person) => !('planning' in person))).toBe(true);
    expect(JSON.stringify(standard)).not.toContain('Secret objective');
    expect(standard.people.find((person) => person.id === ravi)?.notes).toBe('Private note');
  });

  it('full (owner, reviewer) is untouched', () => {
    expect(graphForVisibility(withPlanning, 'full')).toBe(withPlanning);
  });
});
