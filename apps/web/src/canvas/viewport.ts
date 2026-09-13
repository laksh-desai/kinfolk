/**
 * Pan/zoom math for the canvas, kept free of React and the DOM so it can be unit-tested.
 * A viewport maps world coordinates (layout units) to screen pixels:
 *   screen = world × scale + (x, y)
 */
export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface WorldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MIN_SCALE = 0.25;
export const MAX_SCALE = 2;
/**
 * Fit-to-content may go below MIN_SCALE so a tree always opens whole (SPEC §12). Even the
 * 60-person seed tree needs about 9% at 768px. Manual zoom never goes further out than 25%
 * or the current fit level. See QUESTIONS Q34.
 */
export const FIT_MIN_SCALE = 0.05;
export const ZOOM_STEP = 1.2;

/** Clamp a zoom level. `floor` lets a below-minimum fit level stand without zooming back in. */
export function clampScale(scale: number, floor = MIN_SCALE): number {
  return Math.min(MAX_SCALE, Math.max(Math.min(MIN_SCALE, floor), scale));
}

export function toWorld(viewport: Viewport, screenX: number, screenY: number): { x: number; y: number } {
  return { x: (screenX - viewport.x) / viewport.scale, y: (screenY - viewport.y) / viewport.scale };
}

/** Zooms so the world point under (screenX, screenY) stays under it — zoom anchors to the cursor. */
export function zoomAt(viewport: Viewport, nextScale: number, screenX: number, screenY: number): Viewport {
  const scale = clampScale(nextScale, viewport.scale);
  const world = toWorld(viewport, screenX, screenY);
  return { scale, x: screenX - world.x * scale, y: screenY - world.y * scale };
}

export function zoomBy(viewport: Viewport, factor: number, size: Size): Viewport {
  return zoomAt(viewport, viewport.scale * factor, size.width / 2, size.height / 2);
}

/** The next "nice" zoom level above or below the current one, so buttons land on round percentages. */
export function steppedScale(scale: number, direction: 1 | -1): number {
  const levels = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
  if (direction === 1) return levels.find((level) => level > scale + 0.001) ?? MAX_SCALE;
  return [...levels].reverse().find((level) => level < scale - 0.001) ?? MIN_SCALE;
}

export function panBy(viewport: Viewport, dx: number, dy: number): Viewport {
  return { ...viewport, x: viewport.x + dx, y: viewport.y + dy };
}

export interface FitResult {
  viewport: Viewport;
  /** False when the content can't fit even at the minimum zoom (QUESTIONS Q34). */
  fitsEntirely: boolean;
}

/**
 * Fits content into the screen with padding, never beyond 100% (small trees shouldn't balloon)
 * and never below the minimum. If the content can't fit at the minimum zoom, centres on
 * `fallbackFocus` (the focus person's card) instead.
 */
export function fitToContent(content: WorldRect, size: Size, options: { padding?: number; fallbackFocus?: WorldRect | null } = {}): FitResult {
  const padding = options.padding ?? 48;
  const availableWidth = Math.max(size.width - padding * 2, 1);
  const availableHeight = Math.max(size.height - padding * 2, 1);
  if (content.width <= 0 || content.height <= 0) {
    return { viewport: { scale: 1, x: size.width / 2 - content.x, y: size.height / 2 - content.y }, fitsEntirely: true };
  }
  const ideal = Math.min(availableWidth / content.width, availableHeight / content.height, 1);
  if (ideal >= FIT_MIN_SCALE) {
    const scale = Math.min(MAX_SCALE, ideal);
    return {
      viewport: {
        scale,
        x: size.width / 2 - (content.x + content.width / 2) * scale,
        y: size.height / 2 - (content.y + content.height / 2) * scale,
      },
      fitsEntirely: true,
    };
  }
  const target = options.fallbackFocus ?? content;
  return {
    viewport: {
      scale: MIN_SCALE,
      x: size.width / 2 - (target.x + target.width / 2) * MIN_SCALE,
      y: size.height / 2 - (target.y + target.height / 2) * MIN_SCALE,
    },
    fitsEntirely: false,
  };
}

/** The world-space rectangle currently on screen. */
export function visibleWorldRect(viewport: Viewport, size: Size): WorldRect {
  const topLeft = toWorld(viewport, 0, 0);
  return { x: topLeft.x, y: topLeft.y, width: size.width / viewport.scale, height: size.height / viewport.scale };
}

/** Pans the least amount needed for `rect` to be fully visible with a margin; unchanged if it already is. */
export function revealRect(viewport: Viewport, rect: WorldRect, size: Size, margin = 64): Viewport {
  const left = rect.x * viewport.scale + viewport.x;
  const top = rect.y * viewport.scale + viewport.y;
  const right = left + rect.width * viewport.scale;
  const bottom = top + rect.height * viewport.scale;
  let dx = 0;
  let dy = 0;
  if (right - left > size.width - margin * 2) dx = size.width / 2 - (left + right) / 2;
  else if (left < margin) dx = margin - left;
  else if (right > size.width - margin) dx = size.width - margin - right;
  if (bottom - top > size.height - margin * 2) dy = size.height / 2 - (top + bottom) / 2;
  else if (top < margin) dy = margin - top;
  else if (bottom > size.height - margin) dy = size.height - margin - bottom;
  return dx === 0 && dy === 0 ? viewport : panBy(viewport, dx, dy);
}

export function centreOn(viewport: Viewport, rect: WorldRect, size: Size): Viewport {
  return {
    ...viewport,
    x: size.width / 2 - (rect.x + rect.width / 2) * viewport.scale,
    y: size.height / 2 - (rect.y + rect.height / 2) * viewport.scale,
  };
}
