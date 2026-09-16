import { displayName } from '@kinfolk/shared/graph/displayName';
import { indexGraph, type GraphIndex } from '@kinfolk/shared/graph/graphIndex';
import { createKinshipResolver, type Kinship, type KinshipResolver } from '@kinfolk/shared/kinship/resolveKinship';
import { computeLayout } from '@kinfolk/shared/layout/computeLayout';
import type { LayoutResult } from '@kinfolk/shared/layout/layoutTypes';
import type { TreeGraph } from '@kinfolk/shared/schemas/graph';
import { useMemo } from 'react';

export interface TreeView {
  graph: TreeGraph;
  index: GraphIndex;
  layout: LayoutResult;
  resolve: KinshipResolver;
  /** Person → what they are to the focus person. */
  relationToFocus: Map<string, Kinship>;
  /** Person → display name ("Ravi Sharma", or "Ravi’s parent — unnamed"). */
  names: Map<string, string>;
  /** Branch ids with no blood relative of the focus person (married-in families). */
  marriedInBranches: Set<string>;
  /** The focus person and their current partner — the household this tree is for (ADR 035). */
  clientHousehold: Set<string>;
}

/** Everything derived from the graph for drawing, memoised so panning never recomputes it. */
export function useTreeView(graph: TreeGraph, collapsed: readonly string[]): TreeView {
  const index = useMemo(() => indexGraph(graph), [graph]);
  // Cards carry name, dates, place, and relationship: four lines need 112px.
  const layout = useMemo(() => computeLayout(graph, { collapsed, cardHeight: 112 }), [graph, collapsed]);
  const resolve = useMemo(() => createKinshipResolver(graph), [graph]);
  const names = useMemo(() => new Map(graph.people.map((person) => [person.id, displayName(index, person.id)])), [graph, index]);
  const relationToFocus = useMemo(() => {
    const focus = graph.focusPersonId;
    const map = new Map<string, Kinship>();
    if (!focus) return map;
    for (const person of graph.people) map.set(person.id, resolve(focus, person.id));
    return map;
  }, [graph, resolve]);
  const marriedInBranches = useMemo(() => {
    const set = new Set<string>();
    if (!graph.focusPersonId) return set;
    const focusId = graph.focusPersonId;
    // Only branches connected to the focus person can have "married in"; a separate family
    // that isn't linked yet is simply another family.
    const focusComponent = layout.branches.find((branch) => branch.personIds.includes(focusId))?.componentIndex;
    for (const branch of layout.branches) {
      if (branch.componentIndex !== focusComponent) continue;
      const blood = branch.personIds.some((id) => {
        const category = relationToFocus.get(id)?.category;
        return category === 'blood' || category === 'self';
      });
      if (!blood) set.add(branch.id);
    }
    return set;
  }, [layout, relationToFocus, graph.focusPersonId]);
  /**
   * The household the tree is for: the focus person and whoever they are currently partnered
   * with (ADR 035). Marked together on the canvas so the couple reads at a glance. A former
   * spouse is not in it — the marriage has ended.
   */
  const clientHousehold = useMemo(() => {
    const set = new Set<string>();
    const focus = graph.focusPersonId;
    if (!focus || !index.person(focus)) return set;
    set.add(focus);
    for (const { partnerId, union } of index.partnersOf(focus)) {
      if (partnerId && union.status === 'current') set.add(partnerId);
    }
    return set;
  }, [graph.focusPersonId, index]);
  return { graph, index, layout, resolve, relationToFocus, names, marriedInBranches, clientHousehold };
}
