import { describe, expect, it } from 'vitest';
import { buildSeedTree } from '../fixtures/seedTree';
import { needsDetail, needsDetailCount } from './needsDetail';

describe('needsDetail', () => {
  const { graph, people: seed } = buildSeedTree({ namespace: 0x7e5 });

  it('lists the unnamed placeholders and the named people without a birth date, each sorted by name', () => {
    const names = new Map(graph.people.map((person) => [person.id, `${person.firstName ?? ''} ${person.lastName ?? ''}`.trim()]));
    const result = needsDetail(graph.people, (id) => names.get(id) ?? '');
    expect(result.placeholders.map((person) => person.id)).toContain(seed.radhaParent.id);
    expect(result.placeholders.every((person) => person.isPlaceholder)).toBe(true);
    expect(result.noBirthDate.every((person) => !person.isPlaceholder && !person.birthDate)).toBe(true);
    const sorted = (list: typeof result.placeholders) => list.map((person) => names.get(person.id) ?? '');
    expect(sorted(result.noBirthDate)).toEqual([...sorted(result.noBirthDate)].sort((a, b) => a.localeCompare(b)));
  });

  it('counts both groups, and nobody twice', () => {
    const { placeholders, noBirthDate } = needsDetail(graph.people);
    expect(needsDetailCount(graph.people)).toBe(placeholders.length + noBirthDate.length);
    expect(new Set([...placeholders, ...noBirthDate].map((person) => person.id)).size).toBe(placeholders.length + noBirthDate.length);
  });

  it('is empty when everyone is named and dated', () => {
    const complete = graph.people.filter((person) => !person.isPlaceholder && person.birthDate);
    expect(needsDetailCount(complete)).toBe(0);
  });
});
