import type { KeyEvent } from '@kinfolk/shared/events/keyEvents';
import { describe, expect, it } from 'vitest';
import { daysUntilLabel, filterEvents } from './filterEvents';

const event = (overrides: Partial<KeyEvent>): KeyEvent => ({
  id: 'birthday:1',
  type: 'birthday',
  treeId: 't1',
  treeName: 'Sharma family',
  people: [{ id: 'p1', name: 'Ravi Sharma' }],
  title: 'Ravi Sharma’s birthday',
  month: 4,
  day: 12,
  on: { year: 2027, month: 4, day: 12 },
  daysUntil: 200,
  milestone: 39,
  ...overrides,
});

const events = [
  event({}),
  event({ id: 'anniversary:1', type: 'anniversary', title: 'Ravi and Priya: wedding anniversary', people: [{ id: 'p1', name: 'Ravi Sharma' }, { id: 'p2', name: 'Priya Sharma' }], month: 10, day: 8, daysUntil: 20 }),
  event({ id: 'birthday:2', treeId: 't2', treeName: 'Walker family', people: [{ id: 'p3', name: 'Grace Walker' }], title: 'Grace Walker’s birthday', month: 9, day: 16, daysUntil: 1 }),
];

describe('filtering key events', () => {
  it('sorts soonest first by default, and by person, type, or tree on request', () => {
    expect(filterEvents(events, { query: '', month: 'all', sort: 'soonest' }).map((entry) => entry.daysUntil)).toEqual([1, 20, 200]);
    expect(filterEvents(events, { query: '', month: 'all', sort: 'person' })[0]?.people[0]?.name).toBe('Grace Walker');
    expect(filterEvents(events, { query: '', month: 'all', sort: 'type' })[0]?.type).toBe('anniversary');
    expect(filterEvents(events, { query: '', month: 'all', sort: 'tree' }).map((entry) => entry.treeName)).toEqual(['Sharma family', 'Sharma family', 'Walker family']);
  });

  it('searches names, titles, and trees, and filters by month', () => {
    expect(filterEvents(events, { query: 'grace', month: 'all', sort: 'soonest' })).toHaveLength(1);
    expect(filterEvents(events, { query: 'priya', month: 'all', sort: 'soonest' })[0]?.type).toBe('anniversary');
    expect(filterEvents(events, { query: 'walker family', month: 'all', sort: 'soonest' })).toHaveLength(1);
    expect(filterEvents(events, { query: '', month: 10, sort: 'soonest' }).map((entry) => entry.id)).toEqual(['anniversary:1']);
    expect(filterEvents(events, { query: 'nobody', month: 'all', sort: 'soonest' })).toEqual([]);
  });

  it('says how far away it is in words', () => {
    expect(daysUntilLabel(0)).toBe('Today');
    expect(daysUntilLabel(1)).toBe('Tomorrow');
    expect(daysUntilLabel(3)).toBe('In 3 days');
    expect(daysUntilLabel(10)).toBe('In a week');
    expect(daysUntilLabel(21)).toBe('In 3 weeks');
    expect(daysUntilLabel(200)).toBe('In 7 months');
  });
});
