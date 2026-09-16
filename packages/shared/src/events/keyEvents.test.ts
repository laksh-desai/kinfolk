import { describe, expect, it } from 'vitest';
import { buildSeedTree } from '../fixtures/seedTree';
import type { EventTree } from './keyEvents';
import { daysBetween, keyEvents, keyEventsForTree, nextOccurrence, undatablePeople } from './keyEvents';

const { graph, people, unions } = buildSeedTree();
const tree: EventTree = { treeId: 'tree-1', treeName: 'Sharma family', people: graph.people, unions: graph.unions };
const today = { year: 2026, month: 9, day: 15 };

describe('key events (SPEC §5.8, QUESTIONS Q28)', () => {
  it('finds the seed tree’s birthdays and anniversaries — the screen is never empty with real data', () => {
    const events = keyEventsForTree(tree, today);
    expect(events.length).toBeGreaterThan(20);
    expect(events.some((event) => event.type === 'birthday')).toBe(true);
    expect(events.some((event) => event.type === 'anniversary')).toBe(true);

    const ravi = events.find((event) => event.id === `birthday:${people.ravi.id}`);
    // Ravi was born 12 April 1988, so from 15 September 2026 the next one is in 2027, when he turns 39.
    expect(ravi).toMatchObject({ title: 'Ravi Sharma’s birthday', month: 4, day: 12, on: { year: 2027, month: 4, day: 12 }, milestone: 39 });
    expect(ravi?.daysUntil).toBe(daysBetween(today, { year: 2027, month: 4, day: 12 }));

    const wedding = events.find((event) => event.id === `anniversary:${unions.raviPriya.id}`);
    expect(wedding).toMatchObject({ title: 'Ravi and Priya: wedding anniversary', month: 10, day: 8, milestone: 15 });
    expect(wedding?.people.map((person) => person.name)).toEqual(['Ravi Sharma', 'Priya Sharma']);
  });

  it('leaves out the dead, the divorced, placeholders, and dates without a day', () => {
    const events = keyEventsForTree(tree, today);
    const ids = events.map((event) => event.id);
    // Mohan died in 2005; his birthday is not a reminder.
    expect(ids).not.toContain(`birthday:${people.mohan.id}`);
    // Vikram's first marriage ended in divorce.
    expect(ids).not.toContain(`anniversary:${unions.vikramPriti.id}`);
    // Mohan and Sita's marriage is widowed.
    expect(ids).not.toContain(`anniversary:${unions.mohanSita.id}`);
    // Samuel has a birth year only.
    expect(ids).not.toContain(`birthday:${people.samuel.id}`);
    expect(ids.some((id) => id === `birthday:${people.radhaParent.id}`)).toBe(false);
    expect(undatablePeople(tree).map((person) => person.id)).toContain(people.samuel.id);
  });

  it('sorts soonest first across several trees, and counts the days', () => {
    const second: EventTree = {
      treeId: 'tree-2',
      treeName: 'Walker family',
      people: [{ id: 'p1', firstName: 'Grace', lastName: 'Walker', gender: 'female', lifeStatus: 'living', birthDate: { year: 1975, month: 9, day: 16, approximate: false }, isPlaceholder: false }],
      unions: [],
    };
    const all = keyEvents([tree, second], today);
    // Kiran and Fatima married on 15 September, so their anniversary is today; Grace's birthday is tomorrow.
    expect(all[0]).toMatchObject({ treeName: 'Sharma family', title: 'Kiran and Fatima: wedding anniversary', daysUntil: 0 });
    expect(all[1]).toMatchObject({ treeName: 'Walker family', title: 'Grace Walker’s birthday', daysUntil: 1 });
    expect(all.map((event) => event.daysUntil)).toEqual([...all.map((event) => event.daysUntil)].sort((a, b) => a - b));
    expect(all.every((event) => event.daysUntil >= 0 && event.daysUntil <= 366)).toBe(true);
  });

  it('handles today, year ends, and 29 February', () => {
    expect(nextOccurrence(9, 15, today)).toEqual({ year: 2026, month: 9, day: 15 });
    expect(daysBetween(today, nextOccurrence(9, 15, today))).toBe(0);
    expect(nextOccurrence(1, 1, today)).toEqual({ year: 2027, month: 1, day: 1 });
    expect(nextOccurrence(12, 31, { year: 2026, month: 12, day: 31 })).toEqual({ year: 2026, month: 12, day: 31 });
    // 2027 has no 29 February, so it shows on the 28th; 2028 has a real one.
    expect(nextOccurrence(2, 29, { year: 2027, month: 3, day: 2 })).toEqual({ year: 2028, month: 2, day: 29 });
    expect(nextOccurrence(2, 29, { year: 2027, month: 1, day: 5 })).toEqual({ year: 2027, month: 2, day: 28 });
  });

  it('gives no milestone for an approximate date', () => {
    const approximate: EventTree = {
      treeId: 't',
      treeName: 'T',
      people: [{ id: 'p1', firstName: 'Hari', lastName: null, gender: 'male', lifeStatus: 'living', birthDate: { year: 1950, month: 6, day: 1, approximate: true }, isPlaceholder: false }],
      unions: [],
    };
    expect(keyEventsForTree(approximate, today)[0]).toMatchObject({ milestone: null, month: 6, day: 1 });
  });
});
