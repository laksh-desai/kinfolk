import type { GraphPerson, GraphShape } from '../schemas/graph';
import type { ParentChild } from '../schemas/parentChild';
import type { Union } from '../schemas/union';

export interface ParentLink {
  parentId: string;
  union: Union;
  edge: ParentChild;
}

export interface ChildLink {
  childId: string;
  union: Union;
  edge: ParentChild;
}

export interface PartnerLink {
  /** Null for the single partner of a one-person union. */
  partnerId: string | null;
  union: Union;
}

/** Read-only lookups over a graph. Built once per graph version; every method is O(degree). */
export interface GraphIndex<P extends GraphPerson = GraphPerson> {
  readonly graph: GraphShape<P>;
  person(id: string): P | undefined;
  union(id: string): Union | undefined;
  edge(id: string): ParentChild | undefined;
  /** Unions this person is a partner in, oldest first. */
  unionsOf(personId: string): Union[];
  /** Edges where this person is the child. */
  parentEdgesOf(childId: string): ParentChild[];
  /** Edges hanging off a union. */
  childEdgesOf(unionId: string): ParentChild[];
  parentsOf(childId: string): ParentLink[];
  childrenOf(personId: string): ChildLink[];
  partnersOf(personId: string): PartnerLink[];
  partnersOfUnion(union: Union): string[];
}

function byCreated<T extends { createdAt: string; id: string }>(a: T, b: T): number {
  return a.createdAt === b.createdAt ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.createdAt < b.createdAt ? -1 : 1;
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export function indexGraph<P extends GraphPerson>(graph: GraphShape<P>): GraphIndex<P> {
  const people = new Map(graph.people.map((person) => [person.id, person]));
  const unions = new Map(graph.unions.map((union) => [union.id, union]));
  const edges = new Map(graph.parentChildren.map((edge) => [edge.id, edge]));
  const unionsByPartner = new Map<string, Union[]>();
  const edgesByChild = new Map<string, ParentChild[]>();
  const edgesByUnion = new Map<string, ParentChild[]>();

  for (const union of [...graph.unions].sort(byCreated)) {
    push(unionsByPartner, union.partnerAId, union);
    if (union.partnerBId && union.partnerBId !== union.partnerAId) push(unionsByPartner, union.partnerBId, union);
  }
  for (const edge of [...graph.parentChildren].sort(byCreated)) {
    push(edgesByChild, edge.childId, edge);
    push(edgesByUnion, edge.unionId, edge);
  }

  const partnersOfUnion = (union: Union): string[] =>
    union.partnerBId ? [union.partnerAId, union.partnerBId] : [union.partnerAId];

  return {
    graph,
    person: (id) => people.get(id),
    union: (id) => unions.get(id),
    edge: (id) => edges.get(id),
    unionsOf: (personId) => unionsByPartner.get(personId) ?? [],
    parentEdgesOf: (childId) => edgesByChild.get(childId) ?? [],
    childEdgesOf: (unionId) => edgesByUnion.get(unionId) ?? [],
    partnersOfUnion,
    parentsOf: (childId) =>
      (edgesByChild.get(childId) ?? []).flatMap((edge) => {
        const union = unions.get(edge.unionId);
        return union ? partnersOfUnion(union).map((parentId) => ({ parentId, union, edge })) : [];
      }),
    childrenOf: (personId) =>
      (unionsByPartner.get(personId) ?? []).flatMap((union) =>
        (edgesByUnion.get(union.id) ?? []).map((edge) => ({ childId: edge.childId, union, edge })),
      ),
    partnersOf: (personId) =>
      (unionsByPartner.get(personId) ?? []).map((union) => ({
        partnerId: union.partnerAId === personId ? union.partnerBId : union.partnerAId,
        union,
      })),
  };
}

/** Every person reachable downward (children, grandchildren…) from a person, excluding them. */
export function descendantIds(index: GraphIndex, personId: string): Set<string> {
  const seen = new Set<string>();
  const queue = [personId];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const { childId } of index.childrenOf(current)) {
      if (!seen.has(childId) && childId !== personId) {
        seen.add(childId);
        queue.push(childId);
      }
    }
  }
  return seen;
}
