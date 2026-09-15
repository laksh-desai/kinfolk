import { buildSeedTree } from '@kinfolk/shared/fixtures/seedTree';
import { resolveKinship } from '@kinfolk/shared/kinship/resolveKinship';
import type { RedactedTreeGraph } from '@kinfolk/shared/schemas/graph';
import { describe, expect, it } from 'vitest';
import { toViewGraph } from './toViewGraph';

describe('toViewGraph', () => {
  it('keeps names, relationships, and birth years, and nothing else', () => {
    const { graph, people } = buildSeedTree();
    const redacted: RedactedTreeGraph = {
      focusPersonId: graph.focusPersonId,
      parentChildren: graph.parentChildren,
      unions: graph.unions.map((union) => ({ ...union, startDate: null, endDate: null })),
      people: graph.people.map((person) => ({
        id: person.id,
        createdAt: person.createdAt,
        firstName: person.firstName,
        lastName: person.lastName,
        maidenName: person.maidenName,
        nickname: person.nickname,
        suffix: person.suffix,
        gender: person.gender,
        lifeStatus: person.lifeStatus,
        birthYear: person.birthDate?.year ?? null,
        isPlaceholder: person.isPlaceholder,
      })),
    };
    const view = toViewGraph(redacted);
    const ravi = view.people.find((person) => person.id === people.ravi.id);
    expect(ravi).toMatchObject({ firstName: 'Ravi', birthDate: { year: 1988, month: null, day: null }, email: null, phone: null, address: null, notes: null });
    expect(ravi && 'planning' in ravi).toBe(false);
    // Relationships still resolve exactly as in the full tree.
    expect(resolveKinship(view, people.ravi.id, people.ishaan.id).label).toBe(resolveKinship(graph, people.ravi.id, people.ishaan.id).label);
  });
});
