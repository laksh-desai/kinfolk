import { Prisma, type ParentChild as ParentChildRow, type Person as PersonRow, type Union as UnionRow } from '@prisma/client';
import type { PartialDate } from '@kinfolk/shared/schemas/dates';
import type { TreeGraph, RedactedTreeGraph } from '@kinfolk/shared/schemas/graph';
import type { ParentChild, ParentChildPatch } from '@kinfolk/shared/schemas/parentChild';
import type { Address, Person, PersonDetails, PersonPatch, PersonPlanning, PersonSocials, RedactedPerson } from '@kinfolk/shared/schemas/person';
import type { Union, UnionPatch } from '@kinfolk/shared/schemas/union';

/** What a caller may see of a person. See QUESTIONS Q8/Q9. */
export type Visibility = 'full' | 'standard' | 'redacted';

function dateFrom(year: number | null, month: number | null, day: number | null, approximate: boolean): PartialDate | null {
  return year === null ? null : { year, month, day: month === null ? null : day, approximate };
}

function dateColumns(prefix: 'birth' | 'death' | 'start' | 'end', date: PartialDate | null | undefined) {
  if (date === undefined) return {};
  return {
    [`${prefix}Year`]: date?.year ?? null,
    [`${prefix}Month`]: date?.month ?? null,
    [`${prefix}Day`]: date?.day ?? null,
    [`${prefix}Approximate`]: date?.approximate ?? false,
  };
}

function json(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null || value === undefined ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

export function personFromRow(row: PersonRow): Person {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    firstName: row.firstName,
    lastName: row.lastName,
    maidenName: row.maidenName,
    nickname: row.nickname,
    suffix: row.suffix,
    gender: row.gender,
    lifeStatus: row.lifeStatus,
    birthDate: dateFrom(row.birthYear, row.birthMonth, row.birthDay, row.birthApproximate),
    deathDate: dateFrom(row.deathYear, row.deathMonth, row.deathDay, row.deathApproximate),
    birthPlace: row.birthPlace,
    maritalStatus: row.maritalStatus,
    email: row.email,
    phone: row.phone,
    address: (row.address as Address | null) ?? null,
    photoUrl: row.photoUrl,
    profession: row.profession,
    notes: row.notes,
    isPlaceholder: row.isPlaceholder,
    details: (row.details as PersonDetails | null) ?? null,
    socials: (row.socials as PersonSocials | null) ?? null,
    planning: (row.planning as PersonPlanning | null) ?? null,
    linkedTreeId: row.linkedTreeId,
  };
}

export function personCreateData(treeId: string, person: Person): Prisma.PersonUncheckedCreateInput {
  return {
    id: person.id,
    treeId,
    createdAt: new Date(person.createdAt),
    firstName: person.firstName,
    lastName: person.lastName,
    maidenName: person.maidenName,
    nickname: person.nickname,
    suffix: person.suffix,
    gender: person.gender,
    lifeStatus: person.lifeStatus,
    ...dateColumns('birth', person.birthDate),
    ...dateColumns('death', person.deathDate),
    birthPlace: person.birthPlace,
    maritalStatus: person.maritalStatus,
    email: person.email,
    phone: person.phone,
    address: json(person.address),
    photoUrl: person.photoUrl,
    profession: person.profession,
    notes: person.notes,
    isPlaceholder: person.isPlaceholder,
    details: json(person.details),
    socials: json(person.socials),
    planning: json(person.planning),
    linkedTreeId: person.linkedTreeId,
  };
}

export function personUpdateData(patch: PersonPatch): Prisma.PersonUncheckedUpdateManyInput {
  const { birthDate, deathDate, address, details, socials, planning, ...scalars } = patch;
  return {
    ...scalars,
    ...dateColumns('birth', birthDate),
    ...dateColumns('death', deathDate),
    ...(address !== undefined ? { address: json(address) } : {}),
    ...(details !== undefined ? { details: json(details) } : {}),
    ...(socials !== undefined ? { socials: json(socials) } : {}),
    ...(planning !== undefined ? { planning: json(planning) } : {}),
  };
}

export function unionFromRow(row: UnionRow): Union {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    partnerAId: row.partnerAId,
    partnerBId: row.partnerBId,
    type: row.type,
    status: row.status,
    startDate: dateFrom(row.startYear, row.startMonth, row.startDay, row.startApproximate),
    endDate: dateFrom(row.endYear, row.endMonth, row.endDay, row.endApproximate),
  };
}

export function unionCreateData(treeId: string, union: Union): Prisma.UnionUncheckedCreateInput {
  return {
    id: union.id,
    treeId,
    createdAt: new Date(union.createdAt),
    partnerAId: union.partnerAId,
    partnerBId: union.partnerBId,
    type: union.type,
    status: union.status,
    ...dateColumns('start', union.startDate),
    ...dateColumns('end', union.endDate),
  };
}

export function unionUpdateData(patch: UnionPatch): Prisma.UnionUncheckedUpdateManyInput {
  const { startDate, endDate, ...scalars } = patch;
  return { ...scalars, ...dateColumns('start', startDate), ...dateColumns('end', endDate) };
}

export function parentChildFromRow(row: ParentChildRow): ParentChild {
  return { id: row.id, createdAt: row.createdAt.toISOString(), unionId: row.unionId, childId: row.childId, kind: row.kind };
}

export function parentChildCreateData(treeId: string, edge: ParentChild): Prisma.ParentChildUncheckedCreateInput {
  return { id: edge.id, treeId, createdAt: new Date(edge.createdAt), unionId: edge.unionId, childId: edge.childId, kind: edge.kind };
}

export function parentChildUpdateData(patch: ParentChildPatch): Prisma.ParentChildUncheckedUpdateManyInput {
  return { ...patch };
}

/** Drops planning answers. Used for editors and viewers. */
export function withoutPlanning(person: Person): Person {
  const { planning: _hidden, ...rest } = person;
  return rest;
}

/** The share-link view: an allow-list, so a new Person column can never leak by default. */
export function redactPerson(person: Person): RedactedPerson {
  return {
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
  };
}

export function graphForVisibility(graph: TreeGraph, visibility: 'full' | 'standard'): TreeGraph;
export function graphForVisibility(graph: TreeGraph, visibility: 'redacted'): RedactedTreeGraph;
export function graphForVisibility(graph: TreeGraph, visibility: Visibility): TreeGraph | RedactedTreeGraph {
  if (visibility === 'full') return graph;
  if (visibility === 'standard') return { ...graph, people: graph.people.map(withoutPlanning) };
  return {
    people: graph.people.map(redactPerson),
    unions: graph.unions.map((union) => ({
      id: union.id,
      createdAt: union.createdAt,
      partnerAId: union.partnerAId,
      partnerBId: union.partnerBId,
      type: union.type,
      status: union.status,
      startDate: null,
      endDate: null,
    })),
    parentChildren: graph.parentChildren,
    focusPersonId: graph.focusPersonId,
  };
}
