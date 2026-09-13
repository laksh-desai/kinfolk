import type { GraphPerson, GraphShape } from '../schemas/graph';

export interface CollapseResult<P extends GraphPerson> {
  graph: GraphShape<P>;
  /** Collapsed person → number of people hidden by collapsing them. */
  hiddenCount: Map<string, number>;
}

function componentsOf<P extends GraphPerson>(graph: GraphShape<P>): Map<string, number> {
  const neighbours = new Map<string, string[]>(graph.people.map((person) => [person.id, []]));
  const link = (a: string, b: string) => {
    neighbours.get(a)?.push(b);
    neighbours.get(b)?.push(a);
  };
  const unions = new Map(graph.unions.map((union) => [union.id, union]));
  for (const union of graph.unions) if (union.partnerBId) link(union.partnerAId, union.partnerBId);
  for (const edge of graph.parentChildren) {
    const union = unions.get(edge.unionId);
    if (union) link(union.partnerAId, edge.childId);
  }
  const component = new Map<string, number>();
  let next = 0;
  for (const person of graph.people) {
    if (component.has(person.id)) continue;
    const stack = [person.id];
    component.set(person.id, next);
    while (stack.length > 0) {
      const id = stack.pop() as string;
      for (const other of neighbours.get(id) ?? []) {
        if (!component.has(other)) {
          component.set(other, next);
          stack.push(other);
        }
      }
    }
    next += 1;
  }
  return component;
}

/**
 * Hides everyone below collapsed people — their descendants, and anything (a descendant's
 * spouse and that spouse's family) that was only connected through those descendants. The
 * collapsed person, their partners, and their ancestors stay.
 */
export function collapseGraph<P extends GraphPerson>(graph: GraphShape<P>, collapsed: readonly string[]): CollapseResult<P> {
  const hiddenCount = new Map<string, number>();
  const collapsedSet = new Set(collapsed.filter((id) => graph.people.some((person) => person.id === id)));
  if (collapsedSet.size === 0) return { graph, hiddenCount };

  const unions = new Map(graph.unions.map((union) => [union.id, union]));
  const childrenOf = new Map<string, string[]>();
  for (const edge of graph.parentChildren) {
    const union = unions.get(edge.unionId);
    if (!union) continue;
    for (const parent of union.partnerBId ? [union.partnerAId, union.partnerBId] : [union.partnerAId]) {
      childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), edge.childId]);
    }
  }

  const originalComponent = componentsOf(graph);
  const hidden = new Set<string>();
  const descendantsByCollapsed = new Map<string, Set<string>>();
  for (const id of [...collapsedSet].sort()) {
    const seen = new Set<string>();
    const stack = [...(childrenOf.get(id) ?? [])];
    while (stack.length > 0) {
      const child = stack.pop() as string;
      if (seen.has(child) || child === id) continue;
      seen.add(child);
      stack.push(...(childrenOf.get(child) ?? []));
    }
    descendantsByCollapsed.set(id, seen);
    for (const descendant of seen) hidden.add(descendant);
  }
  // A collapsed person inside another collapsed branch is simply hidden with that branch.
  const visibleCollapsed = [...collapsedSet].filter((id) => !hidden.has(id));

  const keep = (personId: string) => !hidden.has(personId);
  let filtered: GraphShape<P> = {
    people: graph.people.filter((person) => keep(person.id)),
    unions: graph.unions.filter((union) => keep(union.partnerAId) && (union.partnerBId === null || keep(union.partnerBId))),
    parentChildren: [],
    focusPersonId: graph.focusPersonId && keep(graph.focusPersonId) ? graph.focusPersonId : null,
  };
  const keptUnions = new Set(filtered.unions.map((union) => union.id));
  filtered.parentChildren = graph.parentChildren.filter((edge) => keep(edge.childId) && keptUnions.has(edge.unionId));

  // Anything now cut off from every collapsed person it used to share a component with was
  // hanging off the hidden branch.
  const newComponent = componentsOf(filtered);
  const componentsWithCollapsed = new Set(visibleCollapsed.map((id) => newComponent.get(id)));
  const originalWithCollapsed = new Set(visibleCollapsed.map((id) => originalComponent.get(id)));
  const detached = filtered.people.filter((person) => {
    const component = newComponent.get(person.id) as number;
    return !componentsWithCollapsed.has(component) && originalWithCollapsed.has(originalComponent.get(person.id));
  });
  if (detached.length > 0) {
    for (const person of detached) hidden.add(person.id);
    filtered = {
      ...filtered,
      people: filtered.people.filter((person) => !hidden.has(person.id)),
      unions: filtered.unions.filter((union) => !hidden.has(union.partnerAId) && (union.partnerBId === null || !hidden.has(union.partnerBId))),
      parentChildren: filtered.parentChildren.filter((edge) => !hidden.has(edge.childId)),
    };
  }

  for (const id of visibleCollapsed) {
    const component = originalComponent.get(id);
    const descendants = descendantsByCollapsed.get(id) ?? new Set<string>();
    const detachedHere = detached.filter((person) => originalComponent.get(person.id) === component && !descendants.has(person.id));
    hiddenCount.set(id, descendants.size + detachedHere.length);
  }
  return { graph: filtered, hiddenCount };
}
