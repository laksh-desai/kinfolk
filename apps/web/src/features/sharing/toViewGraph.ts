import type { RedactedTreeGraph, TreeGraph } from '@kinfolk/shared/schemas/graph';

/**
 * Shapes a share-link graph for the same canvas and list components the app uses. Fields the
 * server never sent are simply empty; nothing here can add information back (SPEC §2).
 */
export function toViewGraph(graph: RedactedTreeGraph): TreeGraph {
  return {
    focusPersonId: graph.focusPersonId,
    parentChildren: graph.parentChildren,
    unions: graph.unions,
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
      isPlaceholder: person.isPlaceholder,
      birthDate: person.birthYear ? { year: person.birthYear, month: null, day: null, approximate: false } : null,
      deathDate: null,
      birthPlace: null,
      maritalStatus: null,
      email: null,
      phone: null,
      address: null,
      photoUrl: null,
      publicRecordUrl: null,
      profession: null,
      notes: null,
      details: null,
      socials: null,
      linkedTreeId: null,
    })),
  };
}
