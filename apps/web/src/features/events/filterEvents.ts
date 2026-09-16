import type { KeyEvent } from '@kinfolk/shared/events/keyEvents';

export type EventSort = 'soonest' | 'person' | 'type' | 'tree';

export interface EventFilters {
  query: string;
  month: number | 'all';
  sort: EventSort;
}

/** Search, month filter, and sort for the key events table (SPEC §5.8). Pure, so it is testable. */
export function filterEvents(events: KeyEvent[], filters: EventFilters): KeyEvent[] {
  const needle = filters.query.trim().toLowerCase();
  const matches = events.filter((event) => {
    if (filters.month !== 'all' && event.month !== filters.month) return false;
    if (!needle) return true;
    return [event.title, event.treeName, ...event.people.map((person) => person.name)].join(' ').toLowerCase().includes(needle);
  });
  const byTitle = (a: KeyEvent, b: KeyEvent) => a.title.localeCompare(b.title);
  return matches.sort((a, b) => {
    switch (filters.sort) {
      case 'person':
        return (a.people[0]?.name ?? '').localeCompare(b.people[0]?.name ?? '') || byTitle(a, b);
      case 'type':
        return a.type.localeCompare(b.type) || a.daysUntil - b.daysUntil;
      case 'tree':
        return a.treeName.localeCompare(b.treeName) || a.daysUntil - b.daysUntil;
      default:
        return a.daysUntil - b.daysUntil || byTitle(a, b);
    }
  });
}

export function daysUntilLabel(daysUntil: number): string {
  if (daysUntil === 0) return 'Today';
  if (daysUntil === 1) return 'Tomorrow';
  if (daysUntil < 7) return `In ${daysUntil} days`;
  if (daysUntil < 14) return 'In a week';
  if (daysUntil < 60) return `In ${Math.round(daysUntil / 7)} weeks`;
  return `In ${Math.round(daysUntil / 30)} months`;
}
