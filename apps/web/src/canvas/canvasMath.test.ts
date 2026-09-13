import { indexGraph } from '@kinfolk/shared/graph/graphIndex';
import { buildLargeTree } from '@kinfolk/shared/fixtures/largeTree';
import { buildSeedTree } from '@kinfolk/shared/fixtures/seedTree';
import { computeLayout } from '@kinfolk/shared/layout/computeLayout';
import { describe, expect, it } from 'vitest';
import { visibleNodes, VIRTUALIZE_ABOVE } from './culling';
import { nextSelection } from './keyboardNav';
import { roundedPath } from './roundedPath';
import { FIT_MIN_SCALE, fitToContent, MAX_SCALE, MIN_SCALE, revealRect, steppedScale, toWorld, visibleWorldRect, zoomAt } from './viewport';

describe('zoom', () => {
  it('keeps the world point under the cursor fixed while zooming', () => {
    const start = { x: 120, y: -40, scale: 0.8 };
    const cursor = { x: 530, y: 310 };
    const before = toWorld(start, cursor.x, cursor.y);
    const zoomed = zoomAt(start, 1.5, cursor.x, cursor.y);
    const after = toWorld(zoomed, cursor.x, cursor.y);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('lets manual zoom stay at a below-25% fit level without jumping, but never go further out', () => {
    const fitted = { x: 0, y: 0, scale: 0.09 };
    expect(zoomAt(fitted, 0.05, 0, 0).scale).toBe(0.09);
    expect(zoomAt(fitted, 0.12, 0, 0).scale).toBe(0.12);
    expect(zoomAt({ x: 0, y: 0, scale: 0.5 }, 0.1, 0, 0).scale).toBe(MIN_SCALE);
  });

  it('clamps to 25–200%', () => {
    expect(zoomAt({ x: 0, y: 0, scale: 1 }, 10, 0, 0).scale).toBe(MAX_SCALE);
    expect(zoomAt({ x: 0, y: 0, scale: 1 }, 0.01, 0, 0).scale).toBe(MIN_SCALE);
  });

  it('steps between round percentages and stops at the limits', () => {
    expect(steppedScale(1, 1)).toBe(1.1);
    expect(steppedScale(1, -1)).toBe(0.9);
    expect(steppedScale(0.83, 1)).toBe(0.9);
    expect(steppedScale(2, 1)).toBe(2);
    expect(steppedScale(0.25, -1)).toBe(0.25);
  });
});

describe('fit to content (§5.3, §12 “opens fitted at every width from 768 to 2560”)', () => {
  const layout = computeLayout(buildSeedTree().graph);

  it.each([768, 1024, 1280, 1440, 1920, 2560])('fits the whole seed tree inside a %ipx-wide canvas', (width) => {
    const size = { width, height: 700 };
    const { viewport, fitsEntirely } = fitToContent(layout.bounds, size);
    expect(fitsEntirely).toBe(true);
    const left = layout.bounds.x * viewport.scale + viewport.x;
    const right = (layout.bounds.x + layout.bounds.width) * viewport.scale + viewport.x;
    const top = layout.bounds.y * viewport.scale + viewport.y;
    const bottom = (layout.bounds.y + layout.bounds.height) * viewport.scale + viewport.y;
    expect(left).toBeGreaterThanOrEqual(0);
    expect(right).toBeLessThanOrEqual(width);
    expect(top).toBeGreaterThanOrEqual(0);
    expect(bottom).toBeLessThanOrEqual(size.height);
    expect(viewport.scale).toBeGreaterThanOrEqual(FIT_MIN_SCALE);
  });

  it('never enlarges a small tree beyond 100%', () => {
    const { viewport } = fitToContent({ x: 0, y: 0, width: 224, height: 96 }, { width: 1920, height: 1080 });
    expect(viewport.scale).toBe(1);
    expect(viewport.x).toBe(960 - 112);
  });

  it('centres on the focus person at minimum zoom when the tree is too big to fit (QUESTIONS Q34)', () => {
    const large = computeLayout(buildLargeTree());
    const focus = large.nodes[0]!;
    const { viewport, fitsEntirely } = fitToContent(large.bounds, { width: 1280, height: 720 }, { fallbackFocus: focus });
    expect(fitsEntirely).toBe(false);
    expect(viewport.scale).toBe(MIN_SCALE);
    expect((focus.x + focus.width / 2) * viewport.scale + viewport.x).toBeCloseTo(640, 6);
  });

  it('centres an empty tree without dividing by zero', () => {
    expect(fitToContent({ x: 0, y: 0, width: 0, height: 0 }, { width: 800, height: 600 }).viewport).toEqual({ scale: 1, x: 400, y: 300 });
  });
});

describe('reveal', () => {
  it('leaves the viewport alone when the card is already visible, and pans minimally when not', () => {
    const size = { width: 1000, height: 600 };
    const viewport = { x: 0, y: 0, scale: 1 };
    expect(revealRect(viewport, { x: 200, y: 200, width: 224, height: 96 }, size)).toBe(viewport);
    const moved = revealRect(viewport, { x: 1200, y: 200, width: 224, height: 96 }, size);
    expect(moved.y).toBe(0);
    expect(1200 + 224 + moved.x).toBe(1000 - 64);
  });
});

describe('keyboard navigation along relationships', () => {
  const { graph, people } = buildSeedTree();
  const layout = computeLayout(graph);
  const index = indexGraph(graph);

  it('moves up to a parent and down to a child', () => {
    expect([people.vikram.id, people.nisha.id]).toContain(nextSelection(people.ravi.id, 'ArrowUp', layout.nodes, index));
    expect([people.aarav.id, people.anika.id]).toContain(nextSelection(people.ravi.id, 'ArrowDown', layout.nodes, index));
  });

  it('moves sideways through the generation row', () => {
    const right = nextSelection(people.ravi.id, 'ArrowRight', layout.nodes, index);
    const ravi = layout.nodes.find((node) => node.personId === people.ravi.id)!;
    const target = layout.nodes.find((node) => node.personId === right)!;
    expect(target.y).toBe(ravi.y);
    expect(target.x).toBeGreaterThan(ravi.x);
    expect(nextSelection(right, 'ArrowLeft', layout.nodes, index)).toBe(people.ravi.id);
  });

  it('stays put at the edges: topmost generation up, leaf down', () => {
    expect(nextSelection(people.hari.id, 'ArrowUp', layout.nodes, index)).toBe(people.hari.id);
    expect(nextSelection(people.ishaan.id, 'ArrowDown', layout.nodes, index)).toBe(people.ishaan.id);
    expect(nextSelection('missing', 'ArrowDown', layout.nodes, index)).toBe('missing');
  });
});

describe('virtualisation', () => {
  it('renders everything for ordinary trees', () => {
    const layout = computeLayout(buildSeedTree().graph);
    expect(visibleNodes(layout.nodes, { x: 0, y: 0, width: 10, height: 10 })).toHaveLength(layout.nodes.length);
  });

  it('renders only nearby cards for large trees, but always keeps the selected card', () => {
    const layout = computeLayout(buildLargeTree());
    expect(layout.nodes.length).toBeGreaterThan(VIRTUALIZE_ABOVE);
    const view = visibleWorldRect({ x: 0, y: 0, scale: 1 }, { width: 1280, height: 800 });
    const far = layout.nodes[layout.nodes.length - 1]!;
    const shown = visibleNodes(layout.nodes, view, new Set([far.personId]));
    expect(shown.length).toBeLessThan(layout.nodes.length / 4);
    expect(shown.map((node) => node.personId)).toContain(far.personId);
  });
});

describe('roundedPath', () => {
  it('draws straight segments with quadratic corners and shrinks the radius on short legs', () => {
    expect(roundedPath([{ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 50, y: 100 }])).toBe('M0 0 L0 90 Q0 100 10 100 L50 100');
    expect(roundedPath([{ x: 0, y: 0 }, { x: 0, y: 8 }, { x: 50, y: 8 }])).toBe('M0 0 L0 4 Q0 8 4 8 L50 8');
    expect(roundedPath([{ x: 3, y: 4 }])).toBe('M3 4');
  });
});
