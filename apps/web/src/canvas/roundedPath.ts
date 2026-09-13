import type { Point } from '@kinfolk/shared/layout/layoutTypes';

/** SVG path data for an orthogonal polyline with rounded corners (radius shrinks on short legs). */
export function roundedPath(points: readonly Point[], radius = 10): string {
  if (points.length === 0) return '';
  const first = points[0] as Point;
  if (points.length === 1) return `M${first.x} ${first.y}`;
  let d = `M${first.x} ${first.y}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1] as Point;
    const corner = points[index] as Point;
    const next = points[index + 1] as Point;
    const inLength = Math.hypot(corner.x - previous.x, corner.y - previous.y);
    const outLength = Math.hypot(next.x - corner.x, next.y - corner.y);
    const r = Math.min(radius, inLength / 2, outLength / 2);
    if (r <= 0) {
      d += ` L${corner.x} ${corner.y}`;
      continue;
    }
    const before = { x: corner.x - ((corner.x - previous.x) / inLength) * r, y: corner.y - ((corner.y - previous.y) / inLength) * r };
    const after = { x: corner.x + ((next.x - corner.x) / outLength) * r, y: corner.y + ((next.y - corner.y) / outLength) * r };
    d += ` L${round(before.x)} ${round(before.y)} Q${corner.x} ${corner.y} ${round(after.x)} ${round(after.y)}`;
  }
  const last = points[points.length - 1] as Point;
  return `${d} L${last.x} ${last.y}`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
