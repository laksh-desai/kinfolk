import { cardLabel, lifespanLabel, type CalendarDay } from '../dates/partialDate';
import type { LayoutResult } from '../layout/layoutTypes';
import type { GraphPerson, GraphShape } from '../schemas/graph';

export interface TreeSvgOptions {
  title: string;
  /** Person → the label under their name, usually their relationship to the focus person. */
  relationOf?: (personId: string) => string | null;
  padding?: number;
  /** Bottom left: when this was exported. */
  footer?: string;
  /** Bottom centre. Every export of a family's private details carries it. */
  confidential?: string;
  /** Data URI of the ATS tree, drawn large and faint behind the tree itself. */
  watermark?: string;
  /** Data URI of the full ATS lockup, set in the bottom right corner. */
  logo?: string;
  /** Today, so cards read the same age they do on screen. Without it they show dates. */
  today?: CalendarDay;
}

/** Ink, paper, and the two colours that mark a person's gender — the app's palette on paper. */
const INK = '#0f1829';
const MUTED = '#46536b';
const LINE = '#d3dae5';
const EDGE = '#67728a';
const NAVY = '#102a5e';
const TINT: Record<string, string> = {
  male: '#17458c',
  female: '#8d2a63',
  other: '#102a5e',
  unknown: '#102a5e',
};

const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const truncate = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

const DASH: Record<string, string> = { solid: '', dashed: ' stroke-dasharray="8 6"', dotted: ' stroke-dasharray="2 5"' };

/**
 * The tree as a standalone SVG for export (SPEC §5.3): the same geometry the canvas draws, in a
 * file that opens anywhere. Pure — no DOM — so it runs in tests and on a server too.
 */
export function treeSvg<P extends GraphPerson>(graph: GraphShape<P>, layout: LayoutResult, options: TreeSvgOptions): string {
  const padding = options.padding ?? 48;
  // A family tree exports many times wider than a screen, and 13px type on a 7,000px page is
  // invisible. The title and the footer grow with the page so they stay small but legible.
  const scale = Math.min(4, Math.max(1, Math.round((Math.max(layout.bounds.width, 320) / 1600) * 2) / 2));
  const headerHeight = Math.round(72 * scale);
  const hasFooter = Boolean(options.footer || options.confidential || options.logo);
  const footerHeight = hasFooter ? Math.round(56 * scale) : 0;
  const width = Math.max(layout.bounds.width, 320) + padding * 2;
  const height = layout.bounds.height + padding * 2 + headerHeight + footerHeight;
  const people = new Map(graph.people.map((person) => [person.id, person]));
  const offsetX = padding - layout.bounds.x;
  const offsetY = padding + headerHeight - layout.bounds.y;

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(width)}" height="${Math.round(height)}" viewBox="0 0 ${Math.round(width)} ${Math.round(height)}" font-family="Segoe UI, Helvetica, Arial, sans-serif">`,
    `<title>${escape(options.title)}</title>`,
    `<rect width="100%" height="100%" fill="#ffffff"/>`,
  ];

  // The ATS tree, centred and faint behind the family: visible on the page, never in the way
  // of a name. Drawn before the tree so every card and connector sits on top of it.
  if (options.watermark) {
    const markHeight = Math.min(height - headerHeight - footerHeight, width) * 0.72;
    const markWidth = markHeight * (512 / 392);
    parts.push(
      `<image href="${options.watermark}" x="${Math.round((width - markWidth) / 2)}" y="${Math.round(headerHeight + (height - headerHeight - footerHeight - markHeight) / 2)}" width="${Math.round(markWidth)}" height="${Math.round(markHeight)}" opacity="0.07" preserveAspectRatio="xMidYMid meet"/>`,
    );
  }

  parts.push(
    `<text x="${padding}" y="${Math.round(padding + 8 * scale)}" font-size="${Math.round(28 * scale)}" font-weight="600" fill="${INK}">${escape(options.title)}</text>`,
    `<g transform="translate(${Math.round(offsetX)} ${Math.round(offsetY)})">`,
  );

  for (const union of layout.unions) {
    if (union.path.length > 1) {
      const points = union.path.map((point) => `${Math.round(point.x)},${Math.round(point.y)}`).join(' ');
      parts.push(`<polyline points="${points}" fill="none" stroke="${EDGE}" stroke-width="2.5"${DASH[union.style] ?? ''}/>`);
    }
  }
  for (const edge of layout.edges) {
    const points = edge.path.map((point) => `${Math.round(point.x)},${Math.round(point.y)}`).join(' ');
    parts.push(`<polyline points="${points}" fill="none" stroke="${EDGE}" stroke-width="2"${DASH[edge.style] ?? ''}/>`);
  }

  for (const node of layout.nodes) {
    const person = people.get(node.personId);
    if (!person) continue;
    const name = truncate([person.firstName, person.lastName].filter(Boolean).join(' ').trim() || 'Unnamed person', 26);
    const years = options.today ? cardLabel(person, options.today) : lifespanLabel(person);
    const relation = options.relationOf?.(person.id) ?? null;
    const deceased = person.lifeStatus === 'deceased';
    parts.push(
      `<g transform="translate(${Math.round(node.x)} ${Math.round(node.y)})">`,
      `<rect width="${Math.round(node.width)}" height="${Math.round(node.height)}" rx="12" fill="${deceased ? '#eef1f6' : '#ffffff'}" stroke="${person.isPlaceholder ? '#9aa6bb' : LINE}" stroke-width="2"${person.isPlaceholder ? ' stroke-dasharray="6 5"' : ''}/>`,
      // A slim bar in the person's colour: blue for men, pink for women (ADR 033).
      `<rect x="2" y="12" width="5" height="${Math.round(node.height) - 24}" rx="2.5" fill="${TINT[person.gender] ?? NAVY}"${deceased ? ' opacity="0.55"' : ''}/>`,
      `<text x="20" y="30" font-size="16" font-weight="600" fill="${INK}">${escape(name)}</text>`,
    );
    if (years) parts.push(`<text x="20" y="52" font-size="13" fill="${MUTED}">${escape(years)}</text>`);
    if (relation) parts.push(`<text x="20" y="72" font-size="13" fill="${NAVY}">${escape(truncate(relation, 30))}</text>`);
    parts.push('</g>');
  }

  parts.push('</g>');

  // The foot of every export: when it was made, that it is confidential, and whose it is.
  if (hasFooter) {
    const baseline = Math.round(height - 20 * scale);
    parts.push(`<line x1="${padding}" y1="${Math.round(height - footerHeight)}" x2="${Math.round(width - padding)}" y2="${Math.round(height - footerHeight)}" stroke="${LINE}" stroke-width="1"/>`);
    if (options.footer) parts.push(`<text x="${padding}" y="${baseline}" font-size="${Math.round(13 * scale)}" font-weight="500" fill="${MUTED}">${escape(options.footer)}</text>`);
    if (options.confidential) {
      parts.push(
        `<text x="${Math.round(width / 2)}" y="${baseline}" font-size="${Math.round(13 * scale)}" font-weight="700" letter-spacing="${(2.4 * scale).toFixed(1)}" text-anchor="middle" fill="${NAVY}">${escape(options.confidential)}</text>`,
      );
    }
    if (options.logo) {
      const logoHeight = Math.round(34 * scale);
      const logoWidth = logoHeight * (900 / 214);
      parts.push(
        `<image href="${options.logo}" x="${Math.round(width - padding - logoWidth)}" y="${Math.round(height - footerHeight + (footerHeight - logoHeight) / 2)}" width="${Math.round(logoWidth)}" height="${logoHeight}" preserveAspectRatio="xMidYMid meet"/>`,
      );
    }
  }
  parts.push('</svg>');
  return parts.join('\n');
}
