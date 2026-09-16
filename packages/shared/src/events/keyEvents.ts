import { daysInMonth } from '../schemas/dates';
import type { CalendarDay } from '../dates/partialDate';
import type { PartialDate } from '../schemas/dates';
import type { Gender, LifeStatus } from '../schemas/person';
import type { UnionStatus, UnionType } from '../schemas/union';

export type KeyEventType = 'birthday' | 'anniversary';

export interface KeyEvent {
  /** Stable across reloads: the source row and the kind of event. */
  id: string;
  type: KeyEventType;
  treeId: string;
  treeName: string;
  /** One person for a birthday, the partners for an anniversary. */
  people: Array<{ id: string; name: string }>;
  title: string;
  month: number;
  day: number;
  /** The next time it comes round, from `today`. */
  on: CalendarDay;
  daysUntil: number;
  /** The birthday they turn, or years together, on that date. Null when the first year is unknown. */
  milestone: number | null;
}

export interface EventPerson {
  id: string;
  firstName: string;
  lastName: string | null;
  gender: Gender;
  lifeStatus: LifeStatus;
  birthDate: PartialDate | null;
  isPlaceholder: boolean;
}

export interface EventUnion {
  id: string;
  partnerAId: string;
  partnerBId: string | null;
  type: UnionType;
  status: UnionStatus;
  startDate: PartialDate | null;
}

export interface EventTree {
  treeId: string;
  treeName: string;
  people: EventPerson[];
  unions: EventUnion[];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const toUtc = (day: CalendarDay) => Date.UTC(day.year, day.month - 1, day.day);

/**
 * The next time a month and day comes round, on or after `today`. A 29 February date shows on
 * 28 February in a year without a 29th, so the event never silently disappears for three years.
 */
export function nextOccurrence(month: number, day: number, today: CalendarDay): CalendarDay {
  for (const year of [today.year, today.year + 1]) {
    const clamped = Math.min(day, daysInMonth(year, month));
    const candidate = { year, month, day: clamped };
    if (toUtc(candidate) >= toUtc(today)) return candidate;
  }
  return { year: today.year + 1, month, day: Math.min(day, daysInMonth(today.year + 1, month)) };
}

export function daysBetween(from: CalendarDay, to: CalendarDay): number {
  return Math.round((toUtc(to) - toUtc(from)) / MS_PER_DAY);
}

const fullName = (person: EventPerson) => [person.firstName, person.lastName].filter(Boolean).join(' ').trim() || 'Unnamed person';
const possessive = (name: string) => (name.endsWith('s') ? `${name}’` : `${name}’s`);

/**
 * Birthdays and anniversaries that can actually be dated (SPEC §5.8, QUESTIONS Q28): living
 * people with a known day and month, and current partnerships with a known start day and month.
 * A year-only date can't make an event, which is why the screen says so.
 */
export function keyEventsForTree(tree: EventTree, today: CalendarDay): KeyEvent[] {
  const events: KeyEvent[] = [];
  const byId = new Map(tree.people.map((person) => [person.id, person]));

  for (const person of tree.people) {
    const birth = person.birthDate;
    if (person.isPlaceholder || person.lifeStatus === 'deceased' || !birth?.month || !birth.day) continue;
    const on = nextOccurrence(birth.month, birth.day, today);
    events.push({
      id: `birthday:${person.id}`,
      type: 'birthday',
      treeId: tree.treeId,
      treeName: tree.treeName,
      people: [{ id: person.id, name: fullName(person) }],
      title: `${possessive(fullName(person))} birthday`,
      month: birth.month,
      day: birth.day,
      on,
      daysUntil: daysBetween(today, on),
      milestone: birth.approximate ? null : on.year - birth.year,
    });
  }

  for (const union of tree.unions) {
    const start = union.startDate;
    if (union.status !== 'current' || !union.partnerBId || !start?.month || !start.day) continue;
    const partners = [byId.get(union.partnerAId), byId.get(union.partnerBId)].filter((person): person is EventPerson => Boolean(person));
    if (partners.length !== 2 || partners.some((person) => person.lifeStatus === 'deceased' || person.isPlaceholder)) continue;
    const on = nextOccurrence(start.month, start.day, today);
    const names = partners.map((person) => person.firstName || fullName(person));
    events.push({
      id: `anniversary:${union.id}`,
      type: 'anniversary',
      treeId: tree.treeId,
      treeName: tree.treeName,
      people: partners.map((person) => ({ id: person.id, name: fullName(person) })),
      title: `${names.join(' and ')}: ${union.type === 'marriage' ? 'wedding anniversary' : 'anniversary'}`,
      month: start.month,
      day: start.day,
      on,
      daysUntil: daysBetween(today, on),
      milestone: start.approximate ? null : on.year - start.year,
    });
  }

  return events;
}

/** Every event across the trees a person can see, soonest first. */
export function keyEvents(trees: EventTree[], today: CalendarDay): KeyEvent[] {
  return trees
    .flatMap((tree) => keyEventsForTree(tree, today))
    .sort((a, b) => a.daysUntil - b.daysUntil || a.title.localeCompare(b.title));
}

/** People with a birth year but no day and month: they can't make an event yet (SPEC §5.8). */
export function undatablePeople(tree: EventTree): EventPerson[] {
  return tree.people.filter((person) => !person.isPlaceholder && person.lifeStatus !== 'deceased' && person.birthDate !== null && (!person.birthDate.month || !person.birthDate.day));
}
