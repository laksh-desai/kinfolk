import type { GraphPerson, GraphShape } from '../schemas/graph';
import { LINEAL_KINDS, type ParentChildKind } from '../schemas/parentChild';
import type { Gender } from '../schemas/person';
import { ENDED_UNION_STATUSES, type Union } from '../schemas/union';
import {
  ancestorLabel,
  auntUncleLabel,
  cousinLabel,
  descendantLabel,
  gendered,
  inLaw,
  lowerFirst,
  nieceNephewLabel,
  partnerWord,
  possessive,
  siblingLabel,
  type Side,
} from './labels';

export type KinshipCategory = 'self' | 'blood' | 'care' | 'partner' | 'step' | 'in-law' | 'distant' | 'none';

export interface Kinship {
  /** What alter is to ego, e.g. "Maternal grandmother". */
  label: string;
  category: KinshipCategory;
  /** Person ids from ego to alter along the relationship, for drawing on the canvas. */
  path: string[];
  /** Number of hops between people along `path`. */
  steps: number;
}

interface ParentLink {
  parentId: string;
  union: Union;
  kind: ParentChildKind;
}

interface Reach {
  depth: number;
  /** ego … person */
  path: string[];
}

interface BloodRelation {
  /** Generations from ego up to the common ancestor (0 when alter is ego's descendant). */
  up: number;
  /** Generations from alter up to the common ancestor (0 when alter is ego's ancestor). */
  down: number;
  half: boolean;
  side: Side;
  /** Kind of the single edge when up + down = 1. */
  directKind: ParentChildKind | null;
  path: string[];
}

export type KinshipResolver = (egoId: string, alterId: string) => Kinship;

/**
 * Builds a resolver over one graph. Pure: no React, no DOM, no network. Resolution order is
 * blood, then care edges (foster, guardian, step kinds), then partner, then derived step, then
 * in-law, then "Related — N steps away".
 */
export function createKinshipResolver<P extends GraphPerson>(graph: GraphShape<P>): KinshipResolver {
  const people = new Map(graph.people.map((person) => [person.id, person]));
  const unions = new Map(graph.unions.map((union) => [union.id, union]));
  const parents = new Map<string, ParentLink[]>();
  const children = new Map<string, Array<{ childId: string; union: Union; kind: ParentChildKind }>>();
  const partners = new Map<string, Array<{ partnerId: string; union: Union }>>();
  const byCreated = <T extends { createdAt: string; id: string }>(a: T, b: T) =>
    a.createdAt === b.createdAt ? (a.id < b.id ? -1 : 1) : a.createdAt < b.createdAt ? -1 : 1;

  for (const union of [...graph.unions].sort(byCreated)) {
    if (union.partnerBId) {
      partners.set(union.partnerAId, [...(partners.get(union.partnerAId) ?? []), { partnerId: union.partnerBId, union }]);
      partners.set(union.partnerBId, [...(partners.get(union.partnerBId) ?? []), { partnerId: union.partnerAId, union }]);
    }
  }
  for (const edge of [...graph.parentChildren].sort(byCreated)) {
    const union = unions.get(edge.unionId);
    if (!union || !people.has(edge.childId)) continue;
    for (const parentId of union.partnerBId ? [union.partnerAId, union.partnerBId] : [union.partnerAId]) {
      parents.set(edge.childId, [...(parents.get(edge.childId) ?? []), { parentId, union, kind: edge.kind }]);
      children.set(parentId, [...(children.get(parentId) ?? []), { childId: edge.childId, union, kind: edge.kind }]);
    }
  }

  const gender = (id: string): Gender | undefined => people.get(id)?.gender;

  // Lineal ancestry by breadth-first search, tracking people and the unions passed through.
  const upCache = new Map<string, { persons: Map<string, Reach>; unions: Map<string, Reach> }>();
  const up = (start: string) => {
    const cached = upCache.get(start);
    if (cached) return cached;
    const persons = new Map<string, Reach>([[start, { depth: 0, path: [start] }]]);
    const unionReach = new Map<string, Reach>();
    const queue = [start];
    while (queue.length > 0) {
      const current = queue.shift() as string;
      const reach = persons.get(current) as Reach;
      for (const link of parents.get(current) ?? []) {
        if (!LINEAL_KINDS.has(link.kind)) continue;
        if (!unionReach.has(link.union.id)) unionReach.set(link.union.id, { depth: reach.depth + 1, path: reach.path });
        if (!persons.has(link.parentId)) {
          persons.set(link.parentId, { depth: reach.depth + 1, path: [...reach.path, link.parentId] });
          queue.push(link.parentId);
        }
      }
    }
    const result = { persons, unions: unionReach };
    upCache.set(start, result);
    return result;
  };

  /**
   * Maternal or paternal: which of ego's parents the relationship runs through. If the apex is
   * equally close through both parents (pedigree collapse), or the parent's gender is unknown,
   * no side is given.
   */
  const sideOf = (egoId: string, path: string[]): Side => {
    const apexId = path[path.length - 1];
    const depth = path.length - 1;
    if (!apexId || depth < 2) return null;
    const sides = new Set<Side>();
    for (const link of (parents.get(egoId) ?? []).filter((candidate) => LINEAL_KINDS.has(candidate.kind))) {
      if (up(link.parentId).persons.get(apexId)?.depth !== depth - 1) continue;
      const parentGender = gender(link.parentId);
      sides.add(parentGender === 'female' ? 'maternal' : parentGender === 'male' ? 'paternal' : null);
    }
    return sides.size === 1 ? ([...sides][0] ?? null) : null;
  };

  const directKind = (childId: string, parentId: string): ParentChildKind | null =>
    (parents.get(childId) ?? []).filter((link) => link.parentId === parentId && LINEAL_KINDS.has(link.kind)).map((link) => link.kind).sort()[0] ?? null;

  /** The closest blood (biological or adoptive) relationship: alter relative to ego. */
  const blood = (egoId: string, alterId: string): BloodRelation | null => {
    if (egoId === alterId) return null;
    const ego = up(egoId);
    const alter = up(alterId);
    const candidates: BloodRelation[] = [];

    const alterAsAncestor = ego.persons.get(alterId);
    if (alterAsAncestor) {
      candidates.push({
        up: alterAsAncestor.depth,
        down: 0,
        half: false,
        side: alterAsAncestor.depth >= 2 ? sideOf(egoId, alterAsAncestor.path) : null,
        directKind: alterAsAncestor.depth === 1 ? directKind(egoId, alterId) : null,
        path: alterAsAncestor.path,
      });
    }
    const egoAsAncestor = alter.persons.get(egoId);
    if (egoAsAncestor) {
      candidates.push({
        up: 0,
        down: egoAsAncestor.depth,
        half: false,
        side: null,
        directKind: egoAsAncestor.depth === 1 ? directKind(alterId, egoId) : null,
        path: [...egoAsAncestor.path].reverse(),
      });
    }

    const fullAt = new Set<string>();
    for (const [unionId, egoReach] of ego.unions) {
      const alterReach = alter.unions.get(unionId);
      if (!alterReach) continue;
      const union = unions.get(unionId) as Union;
      const apex = union.partnerAId;
      const egoPath = ego.persons.get(apex)?.path ?? [...egoReach.path, apex];
      const alterPath = alter.persons.get(apex)?.path ?? [...alterReach.path, apex];
      fullAt.add(`${apex}:${egoReach.depth}:${alterReach.depth}`);
      if (union.partnerBId) fullAt.add(`${union.partnerBId}:${egoReach.depth}:${alterReach.depth}`);
      candidates.push({
        up: egoReach.depth,
        down: alterReach.depth,
        half: false,
        side: egoReach.depth >= 2 ? sideOf(egoId, egoPath) : null,
        directKind: null,
        path: [...egoPath, ...[...alterPath].reverse().slice(1)],
      });
    }
    for (const [personId, egoReach] of ego.persons) {
      if (egoReach.depth === 0) continue;
      const alterReach = alter.persons.get(personId);
      if (!alterReach || alterReach.depth === 0) continue;
      if (fullAt.has(`${personId}:${egoReach.depth}:${alterReach.depth}`)) continue;
      candidates.push({
        up: egoReach.depth,
        down: alterReach.depth,
        half: true,
        side: egoReach.depth >= 2 ? sideOf(egoId, egoReach.path) : null,
        directKind: null,
        path: [...egoReach.path, ...[...alterReach.path].reverse().slice(1)],
      });
    }

    candidates.sort((a, b) => a.up + a.down - (b.up + b.down) || Number(a.half) - Number(b.half) || Math.max(a.up, a.down) - Math.max(b.up, b.down));
    const best = candidates[0];
    if (!best) return null;
    // A side only applies if every equally close route leaves ego through the same parent.
    if (best.side) {
      const rivals = candidates.filter((candidate) => candidate.up === best.up && candidate.down === best.down && candidate.half === best.half);
      if (rivals.some((candidate) => candidate.side !== best.side)) best.side = null;
    }
    return best;
  };

  const bloodLabel = (relation: BloodRelation, alterId: string): string => {
    const g = gender(alterId);
    const { up: a, down: b, half, side } = relation;
    if (b === 0) {
      if (a === 1 && relation.directKind === 'adopted') return gendered(g, 'Adoptive father', 'Adoptive mother', 'Adoptive parent');
      return ancestorLabel(a, g, side);
    }
    if (a === 0) {
      if (b === 1 && relation.directKind === 'adopted') return gendered(g, 'Adopted son', 'Adopted daughter', 'Adopted child');
      return descendantLabel(b, g);
    }
    if (a === 1 && b === 1) return siblingLabel(g, half);
    if (a === 1) return nieceNephewLabel(b, g, half);
    if (b === 1) return auntUncleLabel(a, g, side, half);
    return cousinLabel(a, b, half);
  };

  const unionBetween = (a: string, b: string): Union | null => {
    const shared = (partners.get(a) ?? []).filter((link) => link.partnerId === b).map((link) => link.union);
    return shared[shared.length - 1] ?? null;
  };

  const partnerLabel = (union: Union, alterId: string): string => {
    const g = gender(alterId);
    const word = partnerWord(g, union.type);
    const deceased = people.get(alterId)?.lifeStatus === 'deceased';
    switch (union.status) {
      case 'current':
        return word;
      case 'separated':
        return `${word} (separated)`;
      case 'widowed':
        return deceased ? `Late ${lowerFirst(word)}` : word;
      default:
        return `Former ${lowerFirst(word)}`;
    }
  };

  const isEnded = (union: Union) => ENDED_UNION_STATUSES.has(union.status) && union.status !== 'separated';
  const former = (union: Union, label: string) => (isEnded(union) ? `Former ${lowerFirst(label)}` : label);

  const linealParents = (id: string) => (parents.get(id) ?? []).filter((link) => LINEAL_KINDS.has(link.kind));
  const linealChildren = (id: string) => (children.get(id) ?? []).filter((link) => LINEAL_KINDS.has(link.kind));
  const isParentOf = (parentId: string, childId: string) => (parents.get(childId) ?? []).some((link) => link.parentId === parentId);

  /** Alter is a step-parent of ego: partner of one of ego's parents, and not ego's parent. */
  const stepParentVia = (egoId: string, alterId: string): { parentId: string; union: Union } | null => {
    if (isParentOf(alterId, egoId)) return null;
    for (const link of linealParents(egoId)) {
      const union = unionBetween(link.parentId, alterId);
      if (union) return { parentId: link.parentId, union };
    }
    return null;
  };

  const step = (egoId: string, alterId: string): Kinship | null => {
    const g = gender(alterId);
    const viaParent = stepParentVia(egoId, alterId);
    if (viaParent) {
      // A parent's ex from before (or after) ego's childhood isn't a step-parent in plain
      // English; say exactly what they are.
      if (isEnded(viaParent.union)) {
        const parentWord = gendered(gender(viaParent.parentId), 'Father', 'Mother', 'Parent');
        return make(`${possessive(parentWord)} former ${lowerFirst(partnerWord(g, viaParent.union.type))}`, 'step', [egoId, viaParent.parentId, alterId]);
      }
      return make(gendered(g, 'Step-father', 'Step-mother', 'Step-parent'), 'step', [egoId, viaParent.parentId, alterId]);
    }
    const viaChild = stepParentVia(alterId, egoId);
    if (viaChild) {
      if (isEnded(viaChild.union)) {
        const exWord = partnerWord(gender(viaChild.parentId), viaChild.union.type);
        return make(`Former ${lowerFirst(possessive(exWord))} ${lowerFirst(gendered(g, 'Son', 'Daughter', 'Child'))}`, 'step', [egoId, viaChild.parentId, alterId]);
      }
      return make(gendered(g, 'Step-son', 'Step-daughter', 'Step-child'), 'step', [egoId, viaChild.parentId, alterId]);
    }
    // Step-sibling: a child of ego's step-parent, sharing no parent with ego.
    const sharesParent = linealParents(alterId).some((link) => linealParents(egoId).some((other) => other.parentId === link.parentId));
    if (!sharesParent) {
      for (const link of linealParents(alterId)) {
        const stepParent = stepParentVia(egoId, link.parentId);
        if (stepParent) {
          return make(gendered(g, 'Step-brother', 'Step-sister', 'Step-sibling'), 'step', [egoId, stepParent.parentId, link.parentId, alterId]);
        }
      }
    }
    // Step-grandparent: parent of a step-parent, or step-parent of a parent.
    for (const link of linealParents(egoId)) {
      const viaGrand = stepParentVia(link.parentId, alterId);
      if (viaGrand) return make(gendered(g, 'Step-grandfather', 'Step-grandmother', 'Step-grandparent'), 'step', [egoId, link.parentId, viaGrand.parentId, alterId]);
    }
    for (const link of linealChildren(alterId)) {
      const viaStep = stepParentVia(egoId, link.childId);
      if (viaStep) return make(gendered(g, 'Step-grandfather', 'Step-grandmother', 'Step-grandparent'), 'step', [egoId, viaStep.parentId, link.childId, alterId]);
    }
    // Step-grandchild: the inverse of the two rules above.
    for (const link of linealParents(alterId)) {
      const viaGrand = stepParentVia(link.parentId, egoId);
      if (viaGrand) return make(gendered(g, 'Step-grandson', 'Step-granddaughter', 'Step-grandchild'), 'step', [egoId, viaGrand.parentId, link.parentId, alterId]);
    }
    for (const link of linealChildren(egoId)) {
      const viaStep = stepParentVia(alterId, link.childId);
      if (viaStep) return make(gendered(g, 'Step-grandson', 'Step-granddaughter', 'Step-grandchild'), 'step', [egoId, link.childId, viaStep.parentId, alterId]);
    }
    return null;
  };

  const inLawOf = (egoId: string, alterId: string): Kinship | null => {
    const g = gender(alterId);
    const options: Array<{ cost: number; kinship: Kinship }> = [];

    // Alter is a blood relative of ego's partner.
    for (const { partnerId, union } of partners.get(egoId) ?? []) {
      const relation = blood(partnerId, alterId);
      if (!relation) continue;
      const { up: a, down: b } = relation;
      if (a === 0) continue; // partner's descendants are step-relatives, handled earlier
      const married = union.type === 'marriage';
      let label: string;
      if (b === 0 && a <= 2 && married) {
        label = inLaw(a === 1 ? gendered(g, 'Father', 'Mother', 'Parent') : gendered(g, 'Grandfather', 'Grandmother', 'Grandparent'));
      } else if (a === 1 && b === 1 && married && !relation.half) {
        label = inLaw(gendered(g, 'Brother', 'Sister', 'Sibling'));
      } else {
        const partnerTerm = partnerWord(gender(partnerId), union.type);
        label = `${possessive(partnerTerm)} ${lowerFirst(bloodLabel(relation, alterId))}`;
      }
      options.push({ cost: a + b + 1, kinship: make(former(union, label), 'in-law', [egoId, ...relation.path.slice(0)]) });
    }

    // Alter is the partner of one of ego's blood relatives.
    for (const { partnerId: relativeId, union } of partners.get(alterId) ?? []) {
      if (relativeId === egoId) continue;
      const relation = blood(egoId, relativeId);
      if (!relation) continue;
      const { up: a, down: b } = relation;
      if (b === 0) continue; // partner of an ancestor is a step-relative, handled earlier
      const married = union.type === 'marriage';
      let label: string;
      if (married && a === 0 && b <= 2) {
        label = inLaw(b === 1 ? gendered(g, 'Son', 'Daughter', 'Child') : gendered(g, 'Grandson', 'Granddaughter', 'Grandchild'));
      } else if (married && a === 1 && b === 1 && !relation.half) {
        label = inLaw(gendered(g, 'Brother', 'Sister', 'Sibling'));
      } else if (married && a === 1 && b === 2 && (g === 'male' || g === 'female')) {
        label = inLaw(g === 'male' ? 'Nephew' : 'Niece');
      } else if (married && a >= 2 && b === 1 && (g === 'male' || g === 'female')) {
        label = `${auntUncleLabel(a, g, relation.side, relation.half)} by marriage`;
      } else {
        label = `${possessive(bloodLabel(relation, relativeId))} ${lowerFirst(partnerWord(g, union.type))}`;
      }
      options.push({ cost: a + b + 1, kinship: make(former(union, label), 'in-law', [...relation.path, alterId]) });
    }

    // Alter is the partner of a close blood relative of ego's partner: "Wife’s sister’s husband".
    // Precise description, not a guessed term; limited to near relatives so it stays readable.
    for (const { partnerId, union: egoUnion } of partners.get(egoId) ?? []) {
      for (const { partnerId: relativeId, union: theirUnion } of partners.get(alterId) ?? []) {
        if (relativeId === partnerId || relativeId === egoId) continue;
        const relation = blood(partnerId, relativeId);
        if (!relation || relation.up + relation.down > 2) continue;
        const label = `${possessive(former(egoUnion, partnerWord(gender(partnerId), egoUnion.type)))} ${lowerFirst(possessive(bloodLabel(relation, relativeId)))} ${lowerFirst(former(theirUnion, partnerWord(g, theirUnion.type)))}`;
        options.push({ cost: relation.up + relation.down + 2, kinship: make(label, 'in-law', [egoId, ...relation.path, alterId]) });
      }
    }

    // Alter is another partner of ego's partner: "Wife’s former husband".
    for (const { partnerId, union: egoUnion } of partners.get(egoId) ?? []) {
      const theirUnion = unionBetween(partnerId, alterId);
      if (!theirUnion || alterId === egoId) continue;
      const label = `${possessive(former(egoUnion, partnerWord(gender(partnerId), egoUnion.type)))} ${lowerFirst(former(theirUnion, partnerWord(g, theirUnion.type)))}`;
      options.push({ cost: 2, kinship: make(label, 'in-law', [egoId, partnerId, alterId]) });
    }

    options.sort((x, y) => x.cost - y.cost);
    return options[0]?.kinship ?? null;
  };

  const distance = (egoId: string, alterId: string): string[] | null => {
    const previous = new Map<string, string | null>([[egoId, null]]);
    const queue = [egoId];
    while (queue.length > 0) {
      const current = queue.shift() as string;
      if (current === alterId) break;
      const neighbours = [
        ...(parents.get(current) ?? []).map((link) => link.parentId),
        ...(children.get(current) ?? []).map((link) => link.childId),
        ...(partners.get(current) ?? []).map((link) => link.partnerId),
      ];
      for (const next of neighbours) {
        if (!previous.has(next)) {
          previous.set(next, current);
          queue.push(next);
        }
      }
    }
    if (!previous.has(alterId)) return null;
    const path: string[] = [];
    for (let at: string | null = alterId; at !== null; at = previous.get(at) ?? null) path.unshift(at);
    return path;
  };

  function make(label: string, category: KinshipCategory, path: string[]): Kinship {
    return { label, category, path, steps: Math.max(path.length - 1, 0) };
  }

  return (egoId: string, alterId: string): Kinship => {
    if (!people.has(egoId) || !people.has(alterId)) return make('No known relationship', 'none', []);
    if (egoId === alterId) return make('Self', 'self', [egoId]);

    const relation = blood(egoId, alterId);
    if (relation) return make(bloodLabel(relation, alterId), 'blood', relation.path);

    const g = gender(alterId);
    const careParent = (parents.get(egoId) ?? []).find((link) => link.parentId === alterId);
    if (careParent) {
      const label =
        careParent.kind === 'foster'
          ? gendered(g, 'Foster father', 'Foster mother', 'Foster parent')
          : careParent.kind === 'guardian'
            ? 'Guardian'
            : gendered(g, 'Step-father', 'Step-mother', 'Step-parent');
      return make(label, careParent.kind === 'step' ? 'step' : 'care', [egoId, alterId]);
    }
    const careChild = (parents.get(alterId) ?? []).find((link) => link.parentId === egoId);
    if (careChild) {
      const label =
        careChild.kind === 'foster'
          ? gendered(g, 'Foster son', 'Foster daughter', 'Foster child')
          : careChild.kind === 'guardian'
            ? 'Ward'
            : gendered(g, 'Step-son', 'Step-daughter', 'Step-child');
      return make(label, careChild.kind === 'step' ? 'step' : 'care', [egoId, alterId]);
    }

    const union = unionBetween(egoId, alterId);
    if (union) return make(partnerLabel(union, alterId), 'partner', [egoId, alterId]);

    const stepRelation = step(egoId, alterId);
    if (stepRelation) return stepRelation;

    const inLawRelation = inLawOf(egoId, alterId);
    if (inLawRelation) return inLawRelation;

    const path = distance(egoId, alterId);
    if (path) return make(`Related — ${path.length - 1} steps away`, 'distant', path);
    return make('No known relationship', 'none', []);
  };
}

/** One-off resolution. For many lookups on the same graph, reuse createKinshipResolver. */
export function resolveKinship<P extends GraphPerson>(graph: GraphShape<P>, egoId: string, alterId: string): Kinship {
  return createKinshipResolver(graph)(egoId, alterId);
}
