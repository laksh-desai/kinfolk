import type { GraphPerson, GraphShape } from '../schemas/graph';

export interface GenerationAssignment {
  /** Person → partner class index. Everyone joined by unions shares a class (and a row). */
  classOf: Map<string, number>;
  /** Class index → members, in canonical person order. */
  classMembers: string[][];
  generationOfClass: number[];
  generationOf: Map<string, number>;
  /** Parent class → child classes, after dropping edges that would form a cycle. */
  classChildren: number[][];
  classParents: number[][];
  componentOfClass: number[];
}

function find(parent: number[], index: number): number {
  let root = index;
  while (parent[root] !== root) root = parent[root] as number;
  let current = index;
  while (parent[current] !== root) {
    const next = parent[current] as number;
    parent[current] = root;
    current = next;
  }
  return root;
}

/**
 * Generation rows (SPEC §5.3 step 1).
 * - Partners always share a row.
 * - Rows come from the longest path down from any root.
 * - A reverse pass pulls parents down to sit directly above their highest child, so a
 *   married-in spouse's parents sit one row above the spouse ("a union anchors them").
 * - Each connected component is shifted so its top row is 0.
 *
 * `people` must be in canonical order.
 */
export function assignGenerations<P extends GraphPerson>(graph: GraphShape<P>): GenerationAssignment {
  const order = new Map(graph.people.map((person, index) => [person.id, index]));
  const parent = graph.people.map((_, index) => index);
  for (const union of graph.unions) {
    const a = order.get(union.partnerAId);
    const b = union.partnerBId === null ? undefined : order.get(union.partnerBId);
    if (a === undefined || b === undefined) continue;
    const rootA = find(parent, a);
    const rootB = find(parent, b);
    if (rootA !== rootB) parent[Math.max(rootA, rootB)] = Math.min(rootA, rootB);
  }

  // Class indices follow the first member's canonical position.
  const classIndexByRoot = new Map<number, number>();
  const classMembers: string[][] = [];
  const classOf = new Map<string, number>();
  graph.people.forEach((person, index) => {
    const root = find(parent, index);
    let classIndex = classIndexByRoot.get(root);
    if (classIndex === undefined) {
      classIndex = classMembers.length;
      classIndexByRoot.set(root, classIndex);
      classMembers.push([]);
    }
    classMembers[classIndex]?.push(person.id);
    classOf.set(person.id, classIndex);
  });
  const classCount = classMembers.length;

  const unions = new Map(graph.unions.map((union) => [union.id, union]));
  const childSets: Array<Set<number>> = Array.from({ length: classCount }, () => new Set());
  const undirected: Array<Set<number>> = Array.from({ length: classCount }, () => new Set());
  for (const edge of graph.parentChildren) {
    const union = unions.get(edge.unionId);
    const childClass = classOf.get(edge.childId);
    const parentClass = union ? classOf.get(union.partnerAId) : undefined;
    if (childClass === undefined || parentClass === undefined) continue;
    undirected[parentClass]?.add(childClass);
    undirected[childClass]?.add(parentClass);
    if (parentClass !== childClass) childSets[parentClass]?.add(childClass);
  }

  // Drop back edges found by a DFS in class order, so odd data (a person partnered with their
  // own step-grandchild, say) still yields a DAG instead of looping.
  const state = new Array<number>(classCount).fill(0);
  const kept: Array<Set<number>> = Array.from({ length: classCount }, () => new Set());
  for (let start = 0; start < classCount; start += 1) {
    if (state[start] !== 0) continue;
    const stack: Array<{ node: number; children: number[]; next: number }> = [
      { node: start, children: [...(childSets[start] ?? [])].sort((a, b) => a - b), next: 0 },
    ];
    state[start] = 1;
    while (stack.length > 0) {
      const frame = stack[stack.length - 1] as { node: number; children: number[]; next: number };
      if (frame.next >= frame.children.length) {
        state[frame.node] = 2;
        stack.pop();
        continue;
      }
      const child = frame.children[frame.next] as number;
      frame.next += 1;
      if (state[child] === 1) continue;
      kept[frame.node]?.add(child);
      if (state[child] === 0) {
        state[child] = 1;
        stack.push({ node: child, children: [...(childSets[child] ?? [])].sort((a, b) => a - b), next: 0 });
      }
    }
  }
  const classChildren = kept.map((set) => [...set].sort((a, b) => a - b));
  const classParents: number[][] = Array.from({ length: classCount }, () => []);
  classChildren.forEach((children, from) => children.forEach((to) => classParents[to]?.push(from)));

  // Topological order (Kahn), smallest class index first for determinism.
  const indegree = classParents.map((parents) => parents.length);
  const ready = indegree.flatMap((degree, index) => (degree === 0 ? [index] : []));
  const topo: number[] = [];
  while (ready.length > 0) {
    ready.sort((a, b) => a - b);
    const next = ready.shift() as number;
    topo.push(next);
    for (const child of classChildren[next] ?? []) {
      indegree[child] = (indegree[child] as number) - 1;
      if (indegree[child] === 0) ready.push(child);
    }
  }

  // 1. Anchor: walk each component outward from its first class, one generation per
  //    parent/child hop. This places a married-in family relative to the family it joins
  //    rather than at the top of the drawing.
  const generationOfClass = new Array<number>(classCount).fill(0);
  const seeded = new Array<boolean>(classCount).fill(false);
  for (let start = 0; start < classCount; start += 1) {
    if (seeded[start]) continue;
    seeded[start] = true;
    const queue = [start];
    while (queue.length > 0) {
      const node = queue.shift() as number;
      const base = generationOfClass[node] as number;
      for (const child of classChildren[node] ?? []) {
        if (seeded[child]) continue;
        seeded[child] = true;
        generationOfClass[child] = base + 1;
        queue.push(child);
      }
      for (const parentClass of classParents[node] ?? []) {
        if (seeded[parentClass]) continue;
        seeded[parentClass] = true;
        generationOfClass[parentClass] = base - 1;
        queue.push(parentClass);
      }
    }
  }
  // 2. Push down: every child at least one row below each parent (longest-path constraint).
  for (const node of topo) {
    for (const child of classChildren[node] ?? []) {
      generationOfClass[child] = Math.max(generationOfClass[child] as number, (generationOfClass[node] as number) + 1);
    }
  }
  // 3. Pull down: parents directly above their highest child, so nothing floats above the
  //    family it belongs to.
  for (let index = topo.length - 1; index >= 0; index -= 1) {
    const node = topo[index] as number;
    const children = classChildren[node] ?? [];
    if (children.length > 0) {
      generationOfClass[node] = Math.min(...children.map((child) => generationOfClass[child] as number)) - 1;
    }
  }

  const componentOfClass = new Array<number>(classCount).fill(-1);
  let component = 0;
  for (let start = 0; start < classCount; start += 1) {
    if (componentOfClass[start] !== -1) continue;
    const members: number[] = [];
    const stack = [start];
    componentOfClass[start] = component;
    while (stack.length > 0) {
      const node = stack.pop() as number;
      members.push(node);
      for (const other of undirected[node] ?? []) {
        if (componentOfClass[other] === -1) {
          componentOfClass[other] = component;
          stack.push(other);
        }
      }
    }
    const top = Math.min(...members.map((node) => generationOfClass[node] as number));
    for (const node of members) generationOfClass[node] = (generationOfClass[node] as number) - top;
    component += 1;
  }

  const generationOf = new Map<string, number>();
  classMembers.forEach((members, index) => members.forEach((id) => generationOf.set(id, generationOfClass[index] as number)));
  return { classOf, classMembers, generationOfClass, generationOf, classChildren, classParents, componentOfClass };
}
