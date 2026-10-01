import type { Person } from '../schemas/person';

export interface NeedsDetail {
  /** Connector people the app created and nobody has named yet. */
  placeholders: Person[];
  /** Named people with no date of birth, so no age, no birthday, and no ordering by birth. */
  noBirthDate: Person[];
}

/**
 * Who still needs attention before a tree is finished (SPEC §4.2, §5.3). One definition for the
 * header count and the Needs-detail screen, so the two can never disagree.
 */
export function needsDetail(people: readonly Person[], nameOf: (id: string) => string = () => ''): NeedsDetail {
  const byName = (a: Person, b: Person) => nameOf(a.id).localeCompare(nameOf(b.id));
  return {
    placeholders: people.filter((person) => person.isPlaceholder).sort(byName),
    noBirthDate: people.filter((person) => !person.isPlaceholder && !person.birthDate).sort(byName),
  };
}

export function needsDetailCount(people: readonly Person[]): number {
  const { placeholders, noBirthDate } = needsDetail(people);
  return placeholders.length + noBirthDate.length;
}
