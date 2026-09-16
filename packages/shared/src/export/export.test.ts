import { describe, expect, it } from 'vitest';
import { buildSeedTree } from '../fixtures/seedTree';
import { computeLayout } from '../layout/computeLayout';
import { createKinshipResolver } from '../kinship/resolveKinship';
import { buildImagePdf } from './pdf';
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
    expect(text.slice(Number(xref?.[1]))).toMatch(/^xref\n0 7/);
    // The image bytes survive untouched.
    expect(pdf.indexOf(0xd8)).toBeGreaterThan(0);
  });

  it('puts a tall picture on a portrait page', () => {
    const pdf = buildImagePdf({ jpeg, pixelWidth: 900, pixelHeight: 1600, title: 'Tall' });
    expect(new TextDecoder('latin1').decode(pdf)).toContain('/MediaBox [0 0 595.28 841.89]');
  });
});
