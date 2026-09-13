import type { GraphPerson } from '../schemas/graph';
import type { GraphIndex } from './graphIndex';

type Named = Pick<GraphPerson, 'firstName' | 'lastName' | 'isPlaceholder'> & { suffix?: string | null; nickname?: string | null };

/** "Ravi Sharma Jr." — the name as typed, without placeholder wording. */
export function fullName(person: Named): string {
  return [person.firstName, person.lastName, person.suffix].filter((part) => part && part.trim()).join(' ').trim();
}

/** The first name to use in running text, or null for someone with no name yet. */
export function shortName(person: Named): string | null {
  const first = person.firstName.trim();
  return first === '' ? null : first;
}

function possessive(name: string): string {
  return name.endsWith('s') ? `${name}’` : `${name}’s`;
}

/**
 * How a person is written in the UI. A named person is their full name; an unnamed placeholder
 * is described by the nearest named relative: "Ravi’s parent — unnamed". Derived from the graph
 * every time, so it stays correct as relationships change.
 */
export function displayName(index: GraphIndex, personId: string): string {
  const person = index.person(personId);
  if (!person) return 'Unknown person';
  const name = fullName(person);
  if (name && !(person.isPlaceholder && person.firstName.trim() === '')) return name;
  return `${describeUnnamed(index, personId)} — unnamed`;
}

function describeUnnamed(index: GraphIndex, personId: string): string {
  const named = (id: string | null) => {
    if (!id) return null;
    const other = index.person(id);
    return other ? shortName(other) : null;
  };
  for (const { childId } of index.childrenOf(personId)) {
    const childName = named(childId);
    if (childName) return `${possessive(childName)} parent`;
  }
  for (const { partnerId } of index.partnersOf(personId)) {
    const partnerName = named(partnerId);
    if (partnerName) return `${possessive(partnerName)} partner`;
  }
  for (const { parentId } of index.parentsOf(personId)) {
    const parentName = named(parentId);
    if (parentName) return `${possessive(parentName)} child`;
  }
  for (const { union } of index.parentsOf(personId)) {
    for (const edge of index.childEdgesOf(union.id)) {
      const siblingName = edge.childId === personId ? null : named(edge.childId);
      if (siblingName) return `${possessive(siblingName)} sibling`;
    }
  }
  return 'Family member';
}
