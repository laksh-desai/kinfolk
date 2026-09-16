import { lifespanLabel } from '../dates/partialDate';
import type { LayoutResult } from '../layout/layoutTypes';
import type { GraphPerson, GraphShape } from '../schemas/graph';

export interface TreeSvgOptions {
  title: string;
  /** Person → the label under their name, usually their relationship to the focus person. */
  relationOf?: (personId: string) => string | null;
  padding?: number;
  footer?: string;
}

const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const truncate = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

const DASH: Record<string, string> = { solid: '', dashed: ' stroke-dasharray="8 6"', dotted: ' stroke-dasharray="2 5"' };

/**
 * The tree as a standalone SVG for export (SPEC §5.3): the same geometry the canvas draws, in a
 * file that opens anywhere. Pure — no DOM — so it runs in tests and on a server too.
 */
export function treeSvg<P extends GraphPerson>(graph: GraphShape<P>, layout: LayoutResult, options: TreeSvgOptions): string {
  const padding = options.padding ?? 48;
  const headerHeight = 72;
  const footerHeight = options.footer ? 28 : 0;
  const width = Math.max(layout.bounds.width, 320) + padding * 2;
  const height = layout.bounds.height + padding * 2 + headerHeight + footerHeight;
  const people = new Map(graph.people.map((person) => [person.id, person]));
  const offsetX = padding - layout.bounds.x;
  const offsetY = padding + headerHeight - layout.bounds.y;

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(width)}" height="${Math.round(height)}" viewBox="0 0 ${Math.round(width)} ${Math.round(height)}" font-family="Segoe UI, Helvetica, Arial, sans-serif">`,
    `<title>${escape(options.title)}</title>`,
    `<rect width="100%" height="100%" fill="#ffffff"/>`,
    `<text x="${padding}" y="${padding + 8}" font-size="28" font-weight="600" fill="#1d1b19">${escape(options.title)}</text>`,
    `<g transform="translate(${Math.round(offsetX)} ${Math.round(offsetY)})">`,
  ];

  for (const union of layout.unions) {
    if (union.path.length > 1) {
      const points = union.path.map((point) => `${Math.round(point.x)},${Math.round(point.y)}`).join(' ');
      parts.push(`<polyline points="${points}" fill="none" stroke="#9a9086" stroke-width="2.5"${DASH[union.style] ?? ''}/>`);
    }
  }
  for (const edge of layout.edges) {
    const points = edge.path.map((point) => `${Math.round(point.x)},${Math.round(point.y)}`).join(' ');
    parts.push(`<polyline points="${points}" fill="none" stroke="#9a9086" stroke-width="2"${DASH[edge.style] ?? ''}/>`);
  }

  for (const node of layout.nodes) {
    const person = people.get(node.personId);
    if (!person) continue;
    const name = truncate([person.firstName, person.lastName].filter(Boolean).join(' ').trim() || 'Unnamed person', 26);
    const years = lifespanLabel(person);
    const relation = options.relationOf?.(person.id) ?? null;
    const deceased = person.lifeStatus === 'deceased';
    parts.push(
      `<g transform="translate(${Math.round(node.x)} ${Math.round(node.y)})">`,
      `<rect width="${Math.round(node.width)}" height="${Math.round(node.height)}" rx="12" fill="${deceased ? '#f2ede6' : '#ffffff'}" stroke="${person.isPlaceholder ? '#b8ada1' : '#d9d0c5'}" stroke-width="2"${person.isPlaceholder ? ' stroke-dasharray="6 5"' : ''}/>`,
      `<text x="16" y="30" font-size="16" font-weight="600" fill="#1d1b19">${escape(name)}</text>`,
    );
    if (years) parts.push(`<text x="16" y="52" font-size="13" fill="#6b6259">${escape(years)}</text>`);
    if (relation) parts.push(`<text x="16" y="72" font-size="13" fill="#8a5b2e">${escape(truncate(relation, 30))}</text>`);
    parts.push('</g>');
  }

  parts.push('</g>');
  if (options.footer) parts.push(`<text x="${padding}" y="${Math.round(height - padding / 2)}" font-size="12" fill="#6b6259">${escape(options.footer)}</text>`);
  parts.push('</svg>');
  return parts.join('\n');
}
