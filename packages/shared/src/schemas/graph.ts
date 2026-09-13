import type { ParentChild } from './parentChild';
import type { Person, RedactedPerson } from './person';
import type { Union } from './union';

/** The whole family graph for one tree — the input to layout, kinship, and every planner. */
export interface TreeGraph {
  people: Person[];
  unions: Union[];
  parentChildren: ParentChild[];
  focusPersonId: string | null;
}

/**
 * The minimum a pure module needs from a person. Layout and kinship accept this so they run
 * on redacted share-link graphs as well as full ones.
 */
export type GraphPerson = Pick<Person, 'id' | 'createdAt' | 'firstName' | 'lastName' | 'gender' | 'lifeStatus' | 'isPlaceholder'> & {
  birthDate?: Person['birthDate'];
  deathDate?: Person['deathDate'];
  birthYear?: number | null;
};

export interface GraphShape<P extends GraphPerson = GraphPerson> {
  people: P[];
  unions: Union[];
  parentChildren: ParentChild[];
  focusPersonId: string | null;
}

export interface RedactedTreeGraph {
  people: RedactedPerson[];
  unions: Array<Pick<Union, 'id' | 'createdAt' | 'partnerAId' | 'partnerBId' | 'type' | 'status'> & { startDate: null; endDate: null }>;
  parentChildren: ParentChild[];
  focusPersonId: string | null;
}
