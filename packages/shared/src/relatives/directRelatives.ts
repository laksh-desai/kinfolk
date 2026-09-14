import type { GraphIndex } from '../graph/graphIndex';
import type { KinshipResolver } from '../kinship/resolveKinship';
import type { ParentChild } from '../schemas/parentChild';
import type { Union } from '../schemas/union';

export interface RelativeEntry {
  personId: string;
  /** What this relative is to the subject: "Mother", "Wife", "Half-brother". */
  label: string;
  /** Extra words for the list: "m. 2011", "adopted". */
  detail: string | null;
}

/** One family the subject is a child of. */
export interface ParentFamily {
  edge: ParentChild;
  union: Union;
  parents: RelativeEntry[];
}

export interface PartnerEntry extends RelativeEntry {
  union: Union;
}

/** One family the subject is a parent in, with its children. */
export interface ChildFamily {
  union: Union;
  partner: RelativeEntry | null;
  children: Array<RelativeEntry & { edge: ParentChild }>;
}

export interface DirectRelatives {
  parentFamilies: ParentFamily[];
  partners: PartnerEntry[];
  childFamilies: ChildFamily[];
  siblings: RelativeEntry[];
}

const STATUS_WORD: Record<Union['status'], string | null> = { current: null, divorced: 'divorced', separated: 'separated', widowed: 'widowed', ended: 'ended' };

export function unionDetail(union: Union): string | null {
  const start = union.startDate?.year;
  const end = union.endDate?.year;
  const parts: string[] = [];
  if (start) parts.push(union.type === 'marriage' ? `m. ${start}` : `since ${start}`);
  const status = STATUS_WORD[union.status];
  if (status) parts.push(end ? `${status} ${end}` : status);
  return parts.length ? parts.join(', ') : null;
}

const kindDetail = (edge: ParentChild) => (edge.kind === 'biological' ? null : edge.kind);

/**
 * The subject's immediate relationships, labelled from their point of view, for the readable
 * relationships list (SPEC §5.4: "Mother: Deval · Brother: Arjun · Wife: Priya (m. 2011)").
 */
export function directRelatives(index: GraphIndex, resolve: KinshipResolver, personId: string): DirectRelatives {
  const entry = (otherId: string, detail: string | null): RelativeEntry => ({ personId: otherId, label: resolve(personId, otherId).label, detail });

  const parentFamilies = index.parentsOf(personId).reduce<ParentFamily[]>((families, link) => {
    const family = families.find((candidate) => candidate.edge.id === link.edge.id);
    if (family) family.parents.push(entry(link.parentId, kindDetail(link.edge)));
    else families.push({ edge: link.edge, union: link.union, parents: [entry(link.parentId, kindDetail(link.edge))] });
    return families;
  }, []);

  const partners = index.partnersOf(personId).flatMap((link) => (link.partnerId ? [{ ...entry(link.partnerId, unionDetail(link.union)), union: link.union }] : []));

  const childFamilies = index.unionsOf(personId).flatMap((union): ChildFamily[] => {
    const edges = index.childEdgesOf(union.id);
    if (edges.length === 0) return [];
    const partnerId = union.partnerAId === personId ? union.partnerBId : union.partnerAId;
    return [
      {
        union,
        partner: partnerId ? entry(partnerId, unionDetail(union)) : null,
        children: edges.map((edge) => ({ ...entry(edge.childId, kindDetail(edge)), edge })),
      },
    ];
  });

  const seen = new Set<string>([personId]);
  const siblings: RelativeEntry[] = [];
  for (const family of parentFamilies) {
    for (const parent of family.parents) {
      for (const { childId } of index.childrenOf(parent.personId)) {
        if (seen.has(childId)) continue;
        seen.add(childId);
        siblings.push(entry(childId, null));
      }
    }
  }

  return { parentFamilies, partners, childFamilies, siblings };
}
