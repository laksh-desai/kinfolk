import type { Point, Rect } from './layoutTypes';

/** Rectangles share interior area (touching edges does not count). */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height;
}

export function isAxisAligned(from: Point, to: Point): boolean {
  return from.x === to.x || from.y === to.y;
}

/**
 * An axis-aligned segment passes through a rectangle's interior. Running along an edge or
 * ending on the boundary (a line arriving at a card) does not count.
 */
export function segmentEntersRect(from: Point, to: Point, rect: Rect): boolean {
  const left = rect.x;
  const right = rect.x + rect.width;
  const top = rect.y;
  const bottom = rect.y + rect.height;
  if (from.y === to.y) {
    const y = from.y;
    if (y <= top || y >= bottom) return false;
    const x1 = Math.min(from.x, to.x);
    const x2 = Math.max(from.x, to.x);
    return x1 < right && x2 > left;
  }
  if (from.x === to.x) {
    const x = from.x;
    if (x <= left || x >= right) return false;
    const y1 = Math.min(from.y, to.y);
    const y2 = Math.max(from.y, to.y);
    return y1 < bottom && y2 > top;
  }
  return true;
}

export function pathEntersRect(path: readonly Point[], rect: Rect): boolean {
  for (let index = 1; index < path.length; index += 1) {
    if (segmentEntersRect(path[index - 1] as Point, path[index] as Point, rect)) return true;
  }
  return false;
}

export function boundsOf(rects: readonly Rect[], points: readonly Point[] = []): Rect {
  if (rects.length === 0 && points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const rect of rects) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
