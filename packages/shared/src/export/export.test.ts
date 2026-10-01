import { describe, expect, it } from 'vitest';
import { buildSeedTree } from '../fixtures/seedTree';
import { computeLayout } from '../layout/computeLayout';
import { createKinshipResolver } from '../kinship/resolveKinship';
import { planPages } from './paginate';
import { buildImagePdf, buildPdf } from './pdf';
import { treeSvg } from './treeSvg';

const { graph, people } = buildSeedTree();
const layout = computeLayout(graph, { cardHeight: 112 });

describe('tree SVG export (SPEC §5.3)', () => {
  const resolve = createKinshipResolver(graph);
  const svg = treeSvg(graph, layout, {
    title: 'Sharma family',
    relationOf: (personId) => (graph.focusPersonId ? resolve(graph.focusPersonId, personId).label : null),
    footer: 'Exported from Kinfolk',
  });

  it('draws every person and connector inside a canvas big enough for them', () => {
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    // Each person is a card plus the slim bar in their colour, over one page-sized background.
    expect((svg.match(/<rect /g) ?? []).length).toBe(layout.nodes.length * 2 + 1);
    expect((svg.match(/<polyline /g) ?? []).length).toBeGreaterThanOrEqual(layout.edges.length);
    const size = /width="(\d+)" height="(\d+)"/.exec(svg);
    expect(Number(size?.[1])).toBeGreaterThanOrEqual(layout.bounds.width);
    expect(Number(size?.[2])).toBeGreaterThanOrEqual(layout.bounds.height);
  });

  it('writes names, lifespans, and relationships, and escapes anything dangerous', () => {
    expect(svg).toContain('>Ravi Sharma<');
    expect(svg).toContain('>1935–2005<');
    expect(svg).toContain('>Paternal grandmother<');
    expect(svg).toContain('<title>Sharma family</title>');
    expect(svg).toContain('Exported from Kinfolk');
    expect(svg).not.toContain('<script');

    const risky = treeSvg(
      { ...graph, people: graph.people.map((person) => (person.id === people.ravi.id ? { ...person, firstName: '<script>alert("x")</script>' } : person)) },
      layout,
      { title: 'Tree & "family" <tag>' },
    );
    expect(risky).not.toContain('<script>');
    expect(risky).toContain('&lt;script&gt;');
    expect(risky).toContain('<title>Tree &amp; &quot;family&quot; &lt;tag&gt;</title>');
  });

  it('leaves out contact details', () => {
    for (const secret of ['ravi.sharma@example.com', '+1 415 555 0142', 'Alder Street', 'Architect']) expect(svg).not.toContain(secret);
  });

  it('marks men and women in their own colour', () => {
    // Vikram is male and Nisha female, so the two bars differ; the export matches the canvas.
    expect(svg).toContain('#17458c');
    expect(svg).toContain('#8d2a63');
  });

  it('carries the ATS branding: the tree behind, the lockup, the date, and CONFIDENTIAL (ADR 033)', () => {
    const branded = treeSvg(graph, layout, {
      title: 'Sharma family',
      footer: 'Exported September 16, 2026',
      confidential: 'CONFIDENTIAL',
      watermark: 'data:image/png;base64,MARK',
      logo: 'data:image/png;base64,LOCKUP',
    });
    const size = /width="(\d+)" height="(\d+)"/.exec(branded);
    const [width, height] = [Number(size?.[1]), Number(size?.[2])];

    // The mark sits behind everything, faint, and before the first card in the file.
    const mark = /<image href="data:image\/png;base64,MARK" x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" opacity="([\d.]+)"/.exec(branded);
    expect(mark, 'watermark').not.toBeNull();
    expect(Number(mark?.[5])).toBeLessThan(0.12);
    expect(branded.indexOf('MARK')).toBeLessThan(branded.indexOf('>Ravi Sharma<'));
    // Centred across the page.
    expect(Number(mark?.[1]) + Number(mark?.[3]) / 2).toBeCloseTo(width / 2, -1);

    // Date bottom left, CONFIDENTIAL centred, the lockup in the bottom right corner — all of it
    // below the rule that closes the drawing, whatever size the page came out.
    const rule = Number(/<line x1="\d+" y1="(\d+)"/.exec(branded)?.[1]);
    expect(rule, 'footer rule').toBeGreaterThan(height / 2);
    expect(branded).toContain('>Exported September 16, 2026<');
    const confidential = /<text x="(\d+)" y="(\d+)"[^>]*text-anchor="middle"[^>]*>CONFIDENTIAL</.exec(branded);
    expect(confidential, 'confidential').not.toBeNull();
    expect(Number(confidential?.[1])).toBeCloseTo(width / 2, -1);
    expect(Number(confidential?.[2])).toBeGreaterThan(rule);
    const logo = /<image href="data:image\/png;base64,LOCKUP" x="(\d+)" y="(\d+)" width="(\d+)"/.exec(branded);
    expect(logo, 'lockup').not.toBeNull();
    expect(Number(logo?.[1]) + Number(logo?.[3])).toBeLessThanOrEqual(width);
    expect(Number(logo?.[1])).toBeGreaterThan(width / 2);
    expect(Number(logo?.[2])).toBeGreaterThan(rule);

    // Small but noticeable: the type grows with a drawing that is thousands of pixels wide.
    const footerSize = Number(/<text x="\d+" y="\d+" font-size="(\d+)"[^>]*>Exported/.exec(branded)?.[1]);
    expect(footerSize).toBeGreaterThan(13);
    expect(footerSize).toBeLessThan(width / 40);

    // Nothing branded, nothing broken: an export without the artwork still opens.
    expect(treeSvg(graph, layout, { title: 'Sharma family' })).not.toContain('<image');
  });
});

describe('PDF export (SPEC §5.3)', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);

  it('writes a valid one-page PDF around the picture', () => {
    const pdf = buildImagePdf({ jpeg, pixelWidth: 1600, pixelHeight: 900, title: 'Sharma family' });
    const text = new TextDecoder('latin1').decode(pdf);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(text).toContain('/Type /Catalog');
    expect(text).toContain('/Filter /DCTDecode');
    expect(text).toContain('/Title (Sharma family)');
    // Landscape picture on a landscape A4 page.
    expect(text).toContain('/MediaBox [0 0 841.89 595.28]');
    const xref = /startxref\n(\d+)/.exec(text);
    expect(Number(xref?.[1])).toBeLessThan(pdf.length);
    expect(text.slice(Number(xref?.[1]))).toMatch(/^xref\n0 8/);
    // The image bytes survive untouched.
    expect(pdf.indexOf(0xd8)).toBeGreaterThan(0);
  });

  it('puts a tall picture on a portrait page', () => {
    const pdf = buildImagePdf({ jpeg, pixelWidth: 900, pixelHeight: 1600, title: 'Tall' });
    expect(new TextDecoder('latin1').decode(pdf)).toContain('/MediaBox [0 0 595.28 841.89]');
  });

  it('writes a document of several sheets, each labelled in Helvetica, with boxes on the overview', () => {
    const page = { width: 792, height: 612 };
    const pdf = buildPdf({
      title: 'Sharma family',
      pages: [
        { ...page, images: [{ jpeg, pixelWidth: 100, pixelHeight: 50, x: 28, y: 28, width: 400, height: 200 }], rects: [{ x: 28, y: 28, width: 200, height: 100, lineWidth: 0.75, gray: 0.5 }], texts: [{ x: 34, y: 42, size: 10, text: '1' }] },
        { ...page, images: [{ jpeg, pixelWidth: 100, pixelHeight: 50, x: 28, y: 28, width: 736, height: 368 }], texts: [{ x: 764, y: 600, size: 9, text: 'Sheet 1 of 2 · row 1, column 1', align: 'right' }] },
        { ...page, images: [{ jpeg, pixelWidth: 100, pixelHeight: 50, x: 28, y: 28, width: 736, height: 368 }], texts: [{ x: 764, y: 600, size: 9, text: 'Sheet 2 of 2 · row 1, column 2', align: 'right' }] },
      ],
    });
    const text = new TextDecoder('latin1').decode(pdf);
    expect(text).toContain('/Count 3');
    expect((text.match(/\/MediaBox \[0 0 792\.00 612\.00\]/g) ?? []).length).toBe(3);
    expect(text).toContain('/BaseFont /Helvetica');
    expect(text).toContain('(Sheet 2 of 2 \\267 row 1, column 2) Tj');
    expect(text).toContain(' re\nS');
    // The cross-reference table lists every object, and the file ends properly.
    const size = Number(/\/Size (\d+)/.exec(text)?.[1]);
    expect(text.slice(Number(/startxref\n(\d+)/.exec(text)?.[1]))).toMatch(new RegExp(`^xref\\n0 ${size}\\n`));
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
  });
});

describe('paginating a picture onto sheets (SPEC §5.3)', () => {
  it('puts a small tree on one Letter sheet, landscape, with nothing to tape', () => {
    const plan = planPages(800, 500);
    expect([plan.pageWidth, plan.pageHeight]).toEqual([792, 612]);
    expect(plan.tiles).toHaveLength(1);
    expect(plan.overview).toBeNull();
    expect(plan.tiles[0]).toMatchObject({ sx: 0, sy: 0, sw: 800, sh: 500, label: '' });
    // Fitted and centred inside the margins.
    expect(plan.tiles[0]!.x).toBeGreaterThanOrEqual(28);
    expect(plan.tiles[0]!.width + plan.tiles[0]!.x).toBeLessThanOrEqual(792 - 28);
  });

  it('tiles the seed tree so a card is never narrower than a thumb, with overlap and an overview', () => {
    const svg = treeSvg(graph, layout, { title: 'Sharma family' });
    const size = /width="(\d+)" height="(\d+)"/.exec(svg);
    const [width, height] = [Number(size?.[1]), Number(size?.[2])];
    const plan = planPages(width, height, { paper: 'a4' });
    expect([plan.pageWidth, plan.pageHeight]).toEqual([841.89, 595.28]);
    expect(plan.tiles.length).toBeGreaterThan(1);
    expect(plan.tiles.length).toBe(plan.rows * plan.columns);
    expect(plan.scale * 176).toBeGreaterThanOrEqual(110);
    expect(plan.overview).not.toBeNull();
    // Neighbours repeat an edge, the last sheets reach the picture's edges, and every sheet says where it goes.
    const [first, second] = plan.tiles;
    if (plan.columns > 1) expect(second!.sx).toBeLessThan(first!.sx + first!.sw);
    const last = plan.tiles[plan.tiles.length - 1]!;
    expect(last.sx + last.sw).toBeCloseTo(width, 5);
    expect(last.sy + last.sh).toBeCloseTo(height, 5);
    expect(first!.label).toBe(`Sheet 1 of ${plan.tiles.length} · row 1, column 1`);
    expect(last.label).toBe(`Sheet ${plan.tiles.length} of ${plan.tiles.length} · row ${plan.rows}, column ${plan.columns}`);
    // Nothing printed wider than the page.
    for (const tile of plan.tiles) expect(tile.x + tile.width).toBeLessThanOrEqual(plan.pageWidth - plan.marginPt + 0.01);
  });
});
