import type { ParentChildKind } from '../schemas/parentChild';

export interface LayoutOptions {
  cardWidth: number;
  cardHeight: number;
  /** Horizontal space between people in the same partner group; the union connector lives here. */
  partnerGap: number;
  /** Between siblings of the same union. */
  siblingGap: number;
  /** Between the child groups of different unions, and between blocks of one component. */
  familyGap: number;
  /** Between disconnected components (§4.5.18). */
  componentGap: number;
  /** Minimum vertical space between generation rows. */
  rowGap: number;
  /** Vertical distance between parallel connector lanes in one gap. */
  laneSpacing: number;
  /** People whose descendants are hidden (collapse a branch). */
  collapsed: readonly string[];
}

export const DEFAULT_LAYOUT_OPTIONS: LayoutOptions = {
  cardWidth: 224,
  cardHeight: 96,
  partnerGap: 44,
  siblingGap: 28,
  familyGap: 64,
  componentGap: 192,
  rowGap: 96,
  laneSpacing: 12,
  collapsed: [],
};

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutNode extends Rect {
  personId: string;
  generation: number;
  /** Shared id for children of one union born on the same known day (twins, triplets). */
  multipleBirthId: string | null;
  /** How many people are hidden because this person's branch is collapsed. 0 when expanded. */
  hiddenCount: number;
  /** True when this person has descendants that could be collapsed. */
  hasDescendants: boolean;
}

export type LineStyle = 'solid' | 'dashed' | 'dotted';

export interface LayoutUnion {
  unionId: string;
  partnerIds: string[];
  /** Where child lines start. */
  anchor: Point;
  /** Connector between partners (empty for a single-parent union). */
  path: Point[];
  style: LineStyle;
}

export interface LayoutEdge {
  parentChildId: string;
  unionId: string;
  childId: string;
  kind: ParentChildKind;
  /** Orthogonal polyline from the union anchor to the child's card edge. */
  path: Point[];
  style: LineStyle;
}

export interface LayoutBranch {
  /** Stable id: the first person of the branch's root group. */
  id: string;
  personIds: string[];
  bounds: Rect;
  componentIndex: number;
}

export interface LayoutResult {
  nodes: LayoutNode[];
  unions: LayoutUnion[];
  edges: LayoutEdge[];
  branches: LayoutBranch[];
  generations: Array<{ generation: number; y: number }>;
  bounds: Rect;
}
