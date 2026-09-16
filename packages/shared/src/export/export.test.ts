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
    expect((svg.match(/<rect /g) ?? []).length).toBe(layout.nodes.length + 1);
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
