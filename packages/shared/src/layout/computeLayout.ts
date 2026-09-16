import { comparePartialDates, isSameFullDate } from '../dates/partialDate';
import type { PartialDate } from '../schemas/dates';
import type { GraphPerson, GraphShape } from '../schemas/graph';
import type { ParentChild, ParentChildKind } from '../schemas/parentChild';
import { ENDED_UNION_STATUSES, type Union } from '../schemas/union';
import { assignGenerations } from './assignGenerations';
import { collapseGraph } from './collapseGraph';
import { boundsOf } from './geometry';
import {
  DEFAULT_LAYOUT_OPTIONS,
  type LayoutBranch,
  type LayoutEdge,
  type LayoutNode,
  type LayoutOptions,
  type LayoutResult,
  type LayoutUnion,
  type LineStyle,
  type Point,
} from './layoutTypes';

const EDGE_STYLE: Record<ParentChildKind, LineStyle> = {
  biological: 'solid',
  adopted: 'dashed',
  step: 'dashed',
  foster: 'dotted',
  guardian: 'dotted',
};

function byCreated<T extends { createdAt: string; id: string }>(a: T, b: T): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function birthOf(person: GraphPerson | undefined): PartialDate | null {
  if (!person) return null;
  if (person.birthDate) return person.birthDate;
  return person.birthYear ? { year: person.birthYear, month: null, day: null, approximate: false } : null;
}

/** Axis-aligned polyline without repeated or collinear interior points. */
function simplify(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const point of points) {
    const last = out[out.length - 1];
    if (last && last.x === point.x && last.y === point.y) continue;
    const beforeLast = out[out.length - 2];
    if (beforeLast && last && ((beforeLast.x === last.x && last.x === point.x) || (beforeLast.y === last.y && last.y === point.y))) {
      out[out.length - 1] = point;
      continue;
    }
    out.push(point);
  }
  return out;
}

/** A subtree being laid out: person x offsets plus the occupied x-extent of each generation row. */
class Block {
  readonly x = new Map<string, number>();
  readonly rows = new Map<number, [number, number]>();

  shift(dx: number): void {
    if (dx === 0) return;
    for (const [id, value] of this.x) this.x.set(id, value + dx);
    for (const [generation, [min, max]] of this.rows) this.rows.set(generation, [min + dx, max + dx]);
  }

  absorb(other: Block): void {
    for (const [id, value] of other.x) this.x.set(id, value);
    for (const [generation, [min, max]] of other.rows) {
      const existing = this.rows.get(generation);
      this.rows.set(generation, existing ? [Math.min(existing[0], min), Math.max(existing[1], max)] : [min, max]);
    }
  }

  occupy(generation: number, min: number, max: number): void {
    const existing = this.rows.get(generation);
    this.rows.set(generation, existing ? [Math.min(existing[0], min), Math.max(existing[1], max)] : [min, max]);
  }

  get minX(): number {
    return Math.min(...[...this.rows.values()].map(([min]) => min));
  }

  get maxX(): number {
    return Math.max(...[...this.rows.values()].map(([, max]) => max));
  }
}

/** Smallest shift that puts `right` at least `gap` to the right of `left` on every shared row. */
function contourShift(left: Block, right: Block, gap: number): number | null {
  let shift: number | null = null;
  for (const [generation, [min]] of right.rows) {
    const other = left.rows.get(generation);
    if (!other) continue;
    const needed = other[1] + gap - min;
    shift = shift === null ? needed : Math.max(shift, needed);
  }
  return shift;
}

interface ChildSlot {
  unionId: string;
  childId: string;
  group: number;
}

/**
 * Computes coordinates for every card and an orthogonal route for every connector.
 * Pure: same graph in, same layout out, whatever order the input arrays arrive in.
 * The algorithm is described step by step in docs/PROGRESS.md §C.
 */
export function computeLayout<P extends GraphPerson>(input: GraphShape<P>, partialOptions: Partial<LayoutOptions> = {}): LayoutResult {
  const o: LayoutOptions = { ...DEFAULT_LAYOUT_OPTIONS, ...partialOptions };
  const W = o.cardWidth;
  const H = o.cardHeight;

  // --- 0. Canonical order, collapse ------------------------------------------------------
  const canonical: GraphShape<P> = {
    people: [...input.people].sort(byCreated),
    unions: [...input.unions].sort(byCreated),
    parentChildren: [...input.parentChildren].sort(byCreated),
    focusPersonId: input.focusPersonId,
  };
  const hasDescendants = new Set<string>();
  {
    const unionById = new Map(canonical.unions.map((union) => [union.id, union]));
    for (const edge of canonical.parentChildren) {
      const union = unionById.get(edge.unionId);
      if (!union) continue;
      hasDescendants.add(union.partnerAId);
      if (union.partnerBId) hasDescendants.add(union.partnerBId);
    }
  }
  const { graph, hiddenCount } = collapseGraph(canonical, o.collapsed);

  const people = new Map(graph.people.map((person) => [person.id, person]));
  const order = new Map(graph.people.map((person, index) => [person.id, index]));
  const unions = new Map(graph.unions.map((union) => [union.id, union]));
  const edgesOfUnion = new Map<string, ParentChild[]>();
  for (const edge of graph.parentChildren) {
    if (!people.has(edge.childId) || !unions.has(edge.unionId)) continue;
    edgesOfUnion.set(edge.unionId, [...(edgesOfUnion.get(edge.unionId) ?? []), edge]);
  }
  const compareChildren = (a: ParentChild, b: ParentChild) =>
    comparePartialDates(birthOf(people.get(a.childId)), birthOf(people.get(b.childId))) ||
    (order.get(a.childId) as number) - (order.get(b.childId) as number);
  for (const list of edgesOfUnion.values()) list.sort(compareChildren);

  /**
   * A total order on people that doesn't depend on when they were typed in: oldest first, then
   * by name, then by id. Every structural choice below breaks ties with this, so the same family
   * draws the same way however it was entered (ADR 029).
   */
  const comparePeople = (a: string, b: string): number => {
    const left = people.get(a);
    const right = people.get(b);
    const byDate = comparePartialDates(birthOf(left), birthOf(right));
    if (byDate !== 0) return byDate;
    const nameOf = (person: P | undefined) => (person ? `${person.firstName} ${person.lastName ?? ''}`.trim().toLowerCase() : '');
    const byName = nameOf(left).localeCompare(nameOf(right));
    if (byName !== 0) return byName;
    return a < b ? -1 : a > b ? 1 : 0;
  };

  /** Earliest-born partner first, so a couple's place doesn't depend on who was entered first. */
  const comparePartners = (a: Union, b: Union) =>
    comparePeople(a.partnerAId, b.partnerAId) ||
    comparePeople(a.partnerBId ?? a.partnerAId, b.partnerBId ?? b.partnerAId) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const chronological = (a: Union, b: Union) => comparePartialDates(a.startDate, b.startDate) || comparePartners(a, b);
  const unionsOfPerson = new Map<string, Union[]>();
  for (const union of [...graph.unions].sort(chronological)) {
    if (!people.has(union.partnerAId)) continue;
    unionsOfPerson.set(union.partnerAId, [...(unionsOfPerson.get(union.partnerAId) ?? []), union]);
    if (union.partnerBId && people.has(union.partnerBId)) {
      unionsOfPerson.set(union.partnerBId, [...(unionsOfPerson.get(union.partnerBId) ?? []), union]);
    }
  }

  // Multiple births: children of one union sharing a full birth date.
  const multipleBirth = new Map<string, string>();
  for (const [unionId, edges] of edgesOfUnion) {
    for (let i = 0; i < edges.length; i += 1) {
      const a = edges[i] as ParentChild;
      const run = [a];
      for (let j = i + 1; j < edges.length; j += 1) {
        const b = edges[j] as ParentChild;
        if (!isSameFullDate(birthOf(people.get(a.childId)), birthOf(people.get(b.childId)))) break;
        run.push(b);
      }
      if (run.length > 1) {
        for (const edge of run) multipleBirth.set(edge.childId, `${unionId}:${a.childId}`);
        i += run.length - 1;
      }
    }
  }

  // --- 1. Generations -----------------------------------------------------------------------
  // Generations are numbered from the people in genealogical order, not the order they were
  // entered: the anchoring walk starts somewhere different otherwise, and a married-in family
  // can land a row higher or lower purely because of typing order (ADR 029).
  const generations = assignGenerations({ ...graph, people: [...graph.people].sort((a, b) => comparePeople(a.id, b.id)) });
  const groupOf = generations.classOf;
  const groupCount = generations.classMembers.length;
  const generationOfGroup = generations.generationOfClass;
  const groupUnions: Union[][] = Array.from({ length: groupCount }, () => []);
  for (const union of [...graph.unions].sort(chronological)) {
    const group = groupOf.get(union.partnerAId);
    if (group !== undefined) groupUnions[group]?.push(union);
  }

  // --- 3. Layout forest: primary and secondary child slots ----------------------------------
  const primary = new Map<number, { parent: number; unionId: string; childId: string }>();
  const secondary: Array<{ child: number; parent: number; unionId: string; childId: string }> = [];
  const visited = new Set<number>();
  const rootOf = new Map<number, number>();
  const preorder = new Map<number, number[]>();
  const visit = (group: number, root: number) => {
    visited.add(group);
    rootOf.set(group, root);
    preorder.get(root)?.push(group);
    for (const union of groupUnions[group] ?? []) {
      for (const edge of edgesOfUnion.get(union.id) ?? []) {
        const child = groupOf.get(edge.childId);
        if (child === undefined || child === group) continue;
        const childGeneration = generationOfGroup[child] as number;
        if (!visited.has(child) && childGeneration > (generationOfGroup[group] as number)) {
          primary.set(child, { parent: group, unionId: union.id, childId: edge.childId });
          visit(child, root);
        } else {
          secondary.push({ child, parent: group, unionId: union.id, childId: edge.childId });
        }
      }
    }
  };
  /** The eldest member of a partner group, for ordering that doesn't depend on entry order. */
  const eldestInGroup = (group: number): string | undefined =>
    (generations.classMembers[group] ?? []).reduce<string | undefined>((eldest, id) => (eldest === undefined || comparePeople(id, eldest) < 0 ? id : eldest), undefined);
  const byEldest = (a: number, b: number) => {
    const [left, right] = [eldestInGroup(a), eldestInGroup(b)];
    if (left === undefined || right === undefined) return left === right ? a - b : left === undefined ? 1 : -1;
    return comparePeople(left, right);
  };

  const roots: number[] = [];
  const topGroups: number[] = [];
  for (let group = 0; group < groupCount; group += 1) {
    if ((generations.classParents[group] ?? []).length === 0) topGroups.push(group);
  }
  // Walking in a fixed genealogical order matters: the first walk to reach a group claims it as
  // its own child, which decides which family each subtree is drawn under.
  for (const root of topGroups.sort(byEldest)) {
    if (visited.has(root)) continue;
    roots.push(root);
    preorder.set(root, []);
    visit(root, root);
  }
  const leftovers: number[] = [];
  for (let group = 0; group < groupCount; group += 1) if (!visited.has(group)) leftovers.push(group);
  for (const group of leftovers.sort(byEldest)) {
    if (visited.has(group)) continue;
    roots.push(group);
    preorder.set(group, []);
    visit(group, group);
  }

  /**
   * Left to right, a tree reads best oldest-line-first, with the focus person's own line leading
   * and anyone not yet connected to them after it. Ordering roots by their earliest-born member
   * rather than by entry order is what makes that hold for a tree built in any order (ADR 029).
   */
  const focusComponent = graph.focusPersonId === null ? undefined : generations.componentOfClass[groupOf.get(graph.focusPersonId) ?? -1];
  const eldestOf = (root: number): string | undefined => {
    const groups = preorder.get(root)?.length ? (preorder.get(root) as number[]) : [root];
    return groups.reduce<string | undefined>((eldest, group) => {
      const inGroup = eldestInGroup(group);
      return inGroup !== undefined && (eldest === undefined || comparePeople(inGroup, eldest) < 0) ? inGroup : eldest;
    }, undefined);
  };
  const eldestByRoot = new Map(roots.map((root) => [root, eldestOf(root)]));
  roots.sort((a, b) => {
    const focusFirst =
      Number(generations.componentOfClass[b] === focusComponent && focusComponent !== undefined) -
      Number(generations.componentOfClass[a] === focusComponent && focusComponent !== undefined);
    if (focusFirst !== 0) return focusFirst;
    const [left, right] = [eldestByRoot.get(a), eldestByRoot.get(b)];
    if (left === undefined || right === undefined) return left === right ? 0 : left === undefined ? 1 : -1;
    return comparePeople(left, right);
  });

  // --- 2. Member order within each partner group -------------------------------------------
  const memberOrder: string[][] = generations.classMembers.map((members, group) => {
    if (members.length === 1) return [...members];
    const hub =
      primary.get(group)?.childId ??
      [...members].sort((a, b) => (unionsOfPerson.get(b)?.length ?? 0) - (unionsOfPerson.get(a)?.length ?? 0) || comparePeople(a, b))[0];
    const placed: string[] = [hub as string];
    const side = new Map<string, 'left' | 'right'>();
    const queue = [hub as string];
    while (queue.length > 0) {
      const current = queue.shift() as string;
      const partners = (unionsOfPerson.get(current) ?? [])
        .map((union) => (union.partnerAId === current ? union.partnerBId : union.partnerAId))
        .filter((id): id is string => id !== null && !placed.includes(id) && members.includes(id));
      const unique = [...new Set(partners)];
      unique.forEach((partner, index) => {
        if (placed.includes(partner)) return;
        let where: 'left' | 'right';
        if (current === hub) where = unique.length > 1 && index === 0 ? 'left' : 'right';
        else where = side.get(current) ?? 'right';
        if (current === hub) {
          if (where === 'left') placed.unshift(partner);
          else placed.push(partner);
        } else {
          const at = placed.indexOf(current);
          placed.splice(where === 'left' ? at : at + 1, 0, partner);
        }
        side.set(partner, where);
        queue.push(partner);
      });
    }
    for (const id of members) if (!placed.includes(id)) placed.push(id);
    return placed;
  });
  const indexInGroup = new Map<string, number>();
  memberOrder.forEach((members) => members.forEach((id, index) => indexInGroup.set(id, index)));
  const step = W + o.partnerGap;
  const unionAnchorOffset = (union: Union): number => {
    const a = indexInGroup.get(union.partnerAId) as number;
    const b = union.partnerBId === null ? a : (indexInGroup.get(union.partnerBId) ?? a);
    return ((a + b) / 2) * step + W / 2;
  };
  const unionsByAnchor: Union[][] = groupUnions.map((list) =>
    [...list].sort((u, v) => unionAnchorOffset(u) - unionAnchorOffset(v) || chronological(u, v)),
  );

  // --- 4. Blocks: lay out each primary subtree bottom-up ---------------------------------------
  const blockOf = new Map<number, Block>();
  const layoutGroup = (group: number): Block => {
    const cached = blockOf.get(group);
    if (cached) return cached;
    const members = memberOrder[group] as string[];
    const generation = generationOfGroup[group] as number;
    const width = members.length * W + (members.length - 1) * o.partnerGap;

    const slots: ChildSlot[] = [];
    const claimed = new Set<number>();
    for (const union of unionsByAnchor[group] ?? []) {
      for (const edge of edgesOfUnion.get(union.id) ?? []) {
        const child = groupOf.get(edge.childId) as number;
        const link = primary.get(child);
        if (link && link.parent === group && link.unionId === union.id && link.childId === edge.childId && !claimed.has(child)) {
          claimed.add(child);
          slots.push({ unionId: union.id, childId: edge.childId, group: child });
        }
      }
    }

    let block: Block | null = null;
    let previousUnion: string | null = null;
    for (const slot of slots) {
      const childBlock = layoutGroup(slot.group);
      if (!block) {
        block = childBlock;
      } else {
        const gap = previousUnion === slot.unionId ? o.siblingGap : o.familyGap;
        const shift = contourShift(block, childBlock, gap) ?? block.maxX + gap - childBlock.minX;
        childBlock.shift(shift);
        block.absorb(childBlock);
      }
      previousUnion = slot.unionId;
    }

    let offset = 0;
    if (block) {
      const diffs: number[] = [];
      for (const union of unionsByAnchor[group] ?? []) {
        const centres = slots.filter((slot) => slot.unionId === union.id).map((slot) => (block as Block).x.get(slot.childId) as number + W / 2);
        if (centres.length === 0) continue;
        diffs.push((Math.min(...centres) + Math.max(...centres)) / 2 - unionAnchorOffset(union));
      }
      offset = Math.round(diffs.reduce((sum, value) => sum + value, 0) / Math.max(diffs.length, 1));
      const existing = block.rows.get(generation);
      if (existing && offset < existing[1] + o.familyGap && offset + width > existing[0] - o.familyGap) {
        offset = existing[1] + o.familyGap;
      }
    }
    const result = block ?? new Block();
    members.forEach((id, index) => result.x.set(id, offset + index * step));
    result.occupy(generation, offset, offset + width);
    blockOf.set(group, result);
    return result;
  };

  // Top level: each forest root, with in-law roots packed right after the tree they join.
  const sequence: Array<{ root: number; block: Block; component: number }> = [];
  const placedRoots = new Set<number>();
  const secondaryByChild = new Map<number, typeof secondary>();
  const secondaryByParent = new Map<number, typeof secondary>();
  for (const link of secondary) {
    secondaryByChild.set(link.child, [...(secondaryByChild.get(link.child) ?? []), link]);
    secondaryByParent.set(link.parent, [...(secondaryByParent.get(link.parent) ?? []), link]);
  }
  const world = new Block();
  let lastComponent: number | null = null;
  const unionXIn = (block: Block, union: Union) => {
    const a = block.x.get(union.partnerAId);
    if (a === undefined) return undefined;
    const b = union.partnerBId === null ? a : (block.x.get(union.partnerBId) ?? a);
    return (a + b) / 2 + W / 2;
  };
  /**
   * Packs a new root's block into the drawing. A different component goes to the right, clear
   * of everything. An in-law root goes on whichever side makes its connectors to people
   * already placed shorter.
   */
  const packIntoWorld = (root: number, block: Block, component: number) => {
    if (lastComponent === null) {
      world.absorb(block);
    } else if (component !== lastComponent) {
      block.shift(world.maxX + o.componentGap - block.minX);
      world.absorb(block);
    } else {
      const inBlock = new Set(preorder.get(root) ?? []);
      const links = secondary.filter((link) => inBlock.has(link.child) !== inBlock.has(link.parent));
      const cost = (shift: number) =>
        links.reduce((total, link) => {
          const union = unions.get(link.unionId) as Union;
          const parentInBlock = inBlock.has(link.parent);
          const anchor = parentInBlock ? (unionXIn(block, union) ?? 0) + shift : (unionXIn(world, union) ?? 0);
          const childLeft = parentInBlock ? world.x.get(link.childId) : (block.x.get(link.childId) ?? 0) + shift;
          return total + Math.abs(anchor - ((childLeft ?? 0) + W / 2));
        }, 0);
      const right = contourShift(world, block, o.familyGap) ?? world.maxX + o.familyGap - block.minX;
      let left: number | null = null;
      for (const [generation, [, max]] of block.rows) {
        const other = world.rows.get(generation);
        if (!other) continue;
        const needed = other[0] - o.familyGap - max;
        left = left === null ? needed : Math.min(left, needed);
      }
      left ??= world.minX - o.familyGap - block.maxX;
      block.shift(links.length > 0 && cost(left) < cost(right) ? left : right);
      world.absorb(block);
    }
    lastComponent = component;
  };
  const place = (root: number) => {
    placedRoots.add(root);
    const component = generations.componentOfClass[root] as number;
    const block = layoutGroup(root);
    packIntoWorld(root, block, component);
    sequence.push({ root, block, component });
    for (const group of preorder.get(root) ?? []) {
      const related = [
        ...(secondaryByChild.get(group) ?? []).map((link) => rootOf.get(link.parent)),
        ...(secondaryByParent.get(group) ?? []).map((link) => rootOf.get(link.child)),
      ];
      for (const other of related) {
        if (other !== undefined && !placedRoots.has(other)) place(other);
      }
    }
  };
  for (const root of roots) if (!placedRoots.has(root)) place(root);

  // --- 5. Rows, lanes, and y coordinates ------------------------------------------------------
  const generationOf = generations.generationOf;
  const maxGeneration = graph.people.length ? Math.max(...graph.people.map((person) => generationOf.get(person.id) as number)) : 0;
  const cardsInRow = new Map<number, Array<[number, number]>>();
  for (const person of graph.people) {
    const generation = generationOf.get(person.id) as number;
    const left = world.x.get(person.id) as number;
    cardsInRow.set(generation, [...(cardsInRow.get(generation) ?? []), [left, left + W]]);
  }
  for (const list of cardsInRow.values()) list.sort((a, b) => a[0] - b[0]);
  const MARGIN = 12;
  /** An x in `row` that no card occupies, as close to `desired` as possible. */
  const freeX = (row: number, desired: number): number => {
    const blocked: Array<[number, number]> = [];
    for (const [left, right] of cardsInRow.get(row) ?? []) {
      const last = blocked[blocked.length - 1];
      if (last && left - MARGIN <= last[1]) last[1] = Math.max(last[1], right + MARGIN);
      else blocked.push([left - MARGIN, right + MARGIN]);
    }
    const hit = blocked.find(([left, right]) => desired > left && desired < right);
    if (!hit) return desired;
    return desired - hit[0] <= hit[1] - desired ? hit[0] : hit[1];
  };

  const centreX = (id: string) => (world.x.get(id) as number) + W / 2;
  interface Horizontal {
    key: string;
    from: number;
    to: number;
  }
  const connectorRequests = new Map<number, Horizontal[]>();
  const busRequests = new Map<number, Horizontal[]>();
  const request = (map: Map<number, Horizontal[]>, gap: number, key: string, a: number, b: number) => {
    const list = map.get(gap) ?? [];
    const existing = list.find((entry) => entry.key === key);
    if (existing) {
      existing.from = Math.min(existing.from, a, b);
      existing.to = Math.max(existing.to, a, b);
    } else {
      list.push({ key, from: Math.min(a, b), to: Math.max(a, b) });
    }
    map.set(gap, list);
  };

  interface PlannedEdge {
    edge: ParentChild;
    union: Union;
    parentRow: number;
    childRow: number;
    columns: number[];
  }
  const planned: PlannedEdge[] = [];
  const isAdjacent = (union: Union) =>
    union.partnerBId !== null && Math.abs((indexInGroup.get(union.partnerAId) as number) - (indexInGroup.get(union.partnerBId) as number)) === 1;
  const anchorXOf = (union: Union) => {
    if (union.partnerBId === null) return centreX(union.partnerAId);
    return Math.round((centreX(union.partnerAId) + centreX(union.partnerBId)) / 2);
  };

  for (const union of graph.unions) {
    if (!people.has(union.partnerAId) || (union.partnerBId !== null && !people.has(union.partnerBId))) continue;
    const row = generationOf.get(union.partnerAId) as number;
    if (union.partnerBId !== null && !isAdjacent(union)) {
      request(connectorRequests, row, `u:${union.id}`, centreX(union.partnerAId), centreX(union.partnerBId));
    }
    for (const edge of edgesOfUnion.get(union.id) ?? []) {
      const childRow = generationOf.get(edge.childId) as number;
      const target = centreX(edge.childId);
      const anchorX = anchorXOf(union);
      const columns: number[] = [];
      if (childRow > row) {
        let current = anchorX;
        for (let through = row + 1; through < childRow; through += 1) {
          current = freeX(through, current === anchorX ? target : current);
          columns.push(current);
        }
        request(busRequests, row, `b:${union.id}`, anchorX, columns[0] ?? target);
        let previous = columns[0] ?? target;
        for (let index = 1; index <= columns.length; index += 1) {
          const next = columns[index] ?? target;
          request(busRequests, row + index, `e:${edge.id}`, previous, next);
          previous = next;
        }
      } else {
        // Child drawn at or above the parent row (only in cycle-broken data): leave the row
        // through a column clear of every card in the rows it must climb past.
        let column = anchorX;
        for (let pass = 0; pass < 8; pass += 1) {
          let moved = false;
          for (let through = childRow + 1; through <= row; through += 1) {
            const next = freeX(through, column);
            if (next !== column) moved = true;
            column = next;
          }
          if (!moved) break;
        }
        columns.push(column);
        request(busRequests, row, `b:${union.id}`, anchorX, column);
        request(busRequests, childRow, `e:${edge.id}`, column, target);
      }
      planned.push({ edge, union, parentRow: row, childRow, columns });
    }
  }

  const laneIndex = new Map<string, number>();
  const assignLanes = (requests: Horizontal[] | undefined): number => {
    if (!requests) return 0;
    const sorted = [...requests].sort((a, b) => a.from - b.from || a.to - b.to || (a.key < b.key ? -1 : 1));
    const laneEnds: number[] = [];
    for (const item of sorted) {
      let lane = laneEnds.findIndex((end) => end + MARGIN < item.from);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(item.to);
      } else {
        laneEnds[lane] = item.to;
      }
      laneIndex.set(item.key, lane);
    }
    return laneEnds.length;
  };
  const rowTop: number[] = [];
  const connectorLaneY = new Map<string, number>();
  const busLaneY = new Map<string, number>();
  let y = 0;
  for (let row = 0; row <= maxGeneration; row += 1) {
    rowTop[row] = y;
    const bottom = y + H;
    const connectors = connectorRequests.get(row);
    const connectorLanes = assignLanes(connectors);
    for (const item of connectors ?? []) connectorLaneY.set(item.key, bottom + 20 + (laneIndex.get(item.key) as number) * o.laneSpacing);
    const buses = busRequests.get(row);
    const busLanes = assignLanes(buses);
    const busTop = bottom + 20 + connectorLanes * o.laneSpacing + (connectorLanes > 0 ? 12 : 16);
    for (const item of buses ?? []) busLaneY.set(`${row}:${item.key}`, busTop + (laneIndex.get(item.key) as number) * o.laneSpacing);
    const needed = busTop - bottom + Math.max(busLanes - 1, 0) * o.laneSpacing + 32;
    y = bottom + Math.max(o.rowGap, needed);
  }

  // --- 6. Routes ---------------------------------------------------------------------------------
  const nodes: LayoutNode[] = graph.people.map((person) => ({
    personId: person.id,
    x: world.x.get(person.id) as number,
    y: rowTop[generationOf.get(person.id) as number] as number,
    width: W,
    height: H,
    generation: generationOf.get(person.id) as number,
    multipleBirthId: multipleBirth.get(person.id) ?? null,
    hiddenCount: hiddenCount.get(person.id) ?? 0,
    hasDescendants: hasDescendants.has(person.id),
  }));

  const layoutUnions: LayoutUnion[] = [];
  const anchors = new Map<string, Point>();
  for (const union of graph.unions) {
    if (!people.has(union.partnerAId) || (union.partnerBId !== null && !people.has(union.partnerBId))) continue;
    const row = generationOf.get(union.partnerAId) as number;
    const top = rowTop[row] as number;
    let path: Point[] = [];
    let anchor: Point;
    if (union.partnerBId === null) {
      anchor = { x: centreX(union.partnerAId), y: top + H };
    } else if (isAdjacent(union)) {
      const [left, right] = [union.partnerAId, union.partnerBId].sort((a, b) => (world.x.get(a) as number) - (world.x.get(b) as number)) as [string, string];
      const midY = top + Math.round(H / 2);
      path = [
        { x: (world.x.get(left) as number) + W, y: midY },
        { x: world.x.get(right) as number, y: midY },
      ];
      anchor = { x: anchorXOf(union), y: midY };
    } else {
      const laneY = connectorLaneY.get(`u:${union.id}`) as number;
      const aX = centreX(union.partnerAId);
      const bX = centreX(union.partnerBId);
      const inset = aX < bX ? 20 : -20;
      path = [
        { x: aX + inset, y: top + H },
        { x: aX + inset, y: laneY },
        { x: bX - inset, y: laneY },
        { x: bX - inset, y: top + H },
      ];
      anchor = { x: Math.round((aX + bX) / 2), y: laneY };
    }
    anchors.set(union.id, anchor);
    layoutUnions.push({
      unionId: union.id,
      partnerIds: union.partnerBId ? [union.partnerAId, union.partnerBId] : [union.partnerAId],
      anchor,
      path,
      style: ENDED_UNION_STATUSES.has(union.status) ? 'dashed' : 'solid',
    });
  }

  const layoutEdges: LayoutEdge[] = planned.map(({ edge, union, parentRow, childRow, columns }) => {
    const anchor = anchors.get(union.id) as Point;
    const target = centreX(edge.childId);
    const busY = busLaneY.get(`${parentRow}:b:${union.id}`) as number;
    const points: Point[] = [anchor, { x: anchor.x, y: busY }];
    if (childRow > parentRow) {
      let currentY = busY;
      columns.forEach((column, index) => {
        points.push({ x: column, y: currentY });
        currentY = busLaneY.get(`${parentRow + index + 1}:e:${edge.id}`) as number;
        points.push({ x: column, y: currentY });
      });
      points.push({ x: target, y: currentY }, { x: target, y: rowTop[childRow] as number });
    } else {
      const column = columns[0] as number;
      const climbY = busLaneY.get(`${childRow}:e:${edge.id}`) as number;
      points.push({ x: column, y: busY }, { x: column, y: climbY }, { x: target, y: climbY }, { x: target, y: (rowTop[childRow] as number) + H });
    }
    return {
      parentChildId: edge.id,
      unionId: union.id,
      childId: edge.childId,
      kind: edge.kind,
      path: simplify(points),
      style: EDGE_STYLE[edge.kind],
    };
  });

  // --- 7. Normalise so the drawing starts at (0, 0) -------------------------------------------
  const allPoints = [...layoutUnions.flatMap((union) => [...union.path, union.anchor]), ...layoutEdges.flatMap((edge) => edge.path)];
  const raw = boundsOf(nodes, allPoints);
  const dx = -raw.x;
  const dy = -raw.y;
  const move = (point: Point): Point => ({ x: point.x + dx, y: point.y + dy });
  for (const node of nodes) {
    node.x += dx;
    node.y += dy;
  }
  for (const union of layoutUnions) {
    union.anchor = move(union.anchor);
    union.path = union.path.map(move);
  }
  for (const edge of layoutEdges) edge.path = edge.path.map(move);
  const nodeById = new Map(nodes.map((node) => [node.personId, node]));

  const branches: LayoutBranch[] = sequence.map((item) => {
    const personIds = (preorder.get(item.root) ?? []).flatMap((group) => memberOrder[group] as string[]);
    return {
      id: (memberOrder[item.root] as string[])[0] as string,
      personIds,
      bounds: boundsOf(personIds.flatMap((id) => nodeById.get(id) ?? [])),
      componentIndex: item.component,
    };
  });

  // Reading order, top row first and left to right. Position already ignores entry order; sorting
  // the lists too means the same family yields byte-identical drawings and exports (ADR 029).
  const byPosition = (a: { x: number; y: number }, b: { x: number; y: number }) => a.y - b.y || a.x - b.x;
  nodes.sort((a, b) => byPosition(a, b) || (a.personId < b.personId ? -1 : 1));
  layoutUnions.sort((a, b) => byPosition(a.anchor, b.anchor) || (a.unionId < b.unionId ? -1 : 1));
  layoutEdges.sort((a, b) => byPosition(a.path[0] as Point, b.path[0] as Point) || (a.parentChildId < b.parentChildId ? -1 : 1));

  return {
    nodes,
    unions: layoutUnions,
    edges: layoutEdges,
    branches,
    generations: rowTop.map((top, generation) => ({ generation, y: top + dy })),
    bounds: { x: 0, y: 0, width: raw.width, height: raw.height },
  };
}
