import { planPages, type Paper } from '@kinfolk/shared/export/paginate';
import { buildPdf, type PdfPage } from '@kinfolk/shared/export/pdf';
import { treeSvg } from '@kinfolk/shared/export/treeSvg';
import { writeGedcom } from '@kinfolk/shared/gedcom/gedcom';
import { writeCsv } from '@kinfolk/shared/import/csv';
import type { LayoutResult } from '@kinfolk/shared/layout/layoutTypes';
import type { TreeGraph } from '@kinfolk/shared/schemas/graph';
import type { ExportFormat } from './exportFormats';

/** A filename someone can find again: "sharma-family-2026-09-15.png". */
export function exportFilename(treeName: string, extension: string, now = new Date()): string {
  const slug = treeName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'family-tree';
  return `${slug}-${now.toISOString().slice(0, 10)}.${extension}`;
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked on the next tick: Safari needs the URL to outlive the click.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const CANNOT_DRAW = 'The picture couldn’t be drawn in this browser.';

/** The SVG as a decoded image the browser can paint any part of, at any size. */
async function loadSvg(svg: string): Promise<{ image: HTMLImageElement; width: number; height: number; release: () => void }> {
  const size = /width="(\d+)" height="(\d+)"/.exec(svg);
  const width = Number(size?.[1] ?? 1200);
  const height = Number(size?.[2] ?? 800);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error(CANNOT_DRAW));
      element.src = url;
    });
    return { image, width, height, release: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

/** Paints one region of the image onto a white canvas at `pixelsPerUnit` pixels per picture unit. */
function paint(image: HTMLImageElement, region: { sx: number; sy: number; sw: number; sh: number }, pixelsPerUnit: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(region.sw * pixelsPerUnit));
  canvas.height = Math.max(1, Math.round(region.sh * pixelsPerUnit));
  const context = canvas.getContext('2d');
  if (!context) throw new Error(CANNOT_DRAW);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, region.sx, region.sy, region.sw, region.sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

const jpegOf = (canvas: HTMLCanvasElement) => dataUrlToBytes(canvas.toDataURL('image/jpeg', 0.92));

/**
 * The ATS artwork, as data URIs. An exported picture is rasterised from an SVG in an isolated
 * image, which may not reach back for a file, so the bytes have to travel inside it. Fetched
 * once per session, and an export still works without them.
 */
const brandArtwork = new Map<string, Promise<string | null>>();

function brandImage(path: string): Promise<string | null> {
  const cached = brandArtwork.get(path);
  if (cached) return cached;
  const pending = fetch(path)
    .then(async (response) => {
      if (!response.ok) return null;
      const blob = await response.blob();
      return await new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    })
    .catch(() => null);
  brandArtwork.set(path, pending);
  return pending;
}

export interface ExportInput {
  graph: TreeGraph;
  layout: LayoutResult;
  treeName: string;
  relationOf?: (personId: string) => string | null;
}

export interface ExportOptions {
  /** For a PDF: the paper it will be printed on. */
  paper?: Paper;
}

/** The whole picture on one bitmap, its long edge capped so a 500-person tree doesn't ask for a 90,000px canvas. */
const PNG_MAX_PIXELS = 8000;
/** Sheets print at about this resolution; more only makes the file heavier. */
const PRINT_DPI = 200;
const LABEL = { size: 9, gray: 0.35 };

/** Everything the export menu offers (SPEC §5.3). Each one downloads a real file. */
export async function exportTree(format: ExportFormat, input: ExportInput, options: ExportOptions = {}): Promise<void> {
  if (format === 'gedcom') {
    downloadBlob(exportFilename(input.treeName, 'ged'), new Blob([writeGedcom(input.graph, { treeName: input.treeName })], { type: 'text/plain;charset=utf-8' }));
    return;
  }
  if (format === 'csv') {
    downloadBlob(exportFilename(input.treeName, 'csv'), new Blob([writeCsv(input.graph)], { type: 'text/csv;charset=utf-8' }));
    return;
  }

  const [watermark, logo] = await Promise.all([brandImage('/brand/ats-mark.png'), brandImage('/brand/ats-lockup.png')]);
  // No `today`: a document that will be filed for years shows birth and death years, not an age
  // that is wrong by next spring (ADR 043). The screen keeps the age.
  const svg = treeSvg(input.graph, input.layout, {
    title: input.treeName,
    relationOf: input.relationOf,
    footer: `Exported ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
    confidential: 'CONFIDENTIAL',
    ...(watermark ? { watermark } : {}),
    ...(logo ? { logo } : {}),
  });
  const { image, width, height, release } = await loadSvg(svg);
  try {
    if (format === 'png') {
      const canvas = paint(image, { sx: 0, sy: 0, sw: width, sh: height }, Math.min(2, PNG_MAX_PIXELS / Math.max(width, height)));
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('The picture couldn’t be saved in this browser.');
      downloadBlob(exportFilename(input.treeName, 'png'), blob);
      return;
    }

    // A document of sheets: the whole tree on one page first when there are several, then each
    // sheet at a scale where every name is legible, drawn straight from the SVG so it stays sharp.
    const plan = planPages(width, height, { paper: options.paper ?? 'letter' });
    const pixelsPerUnit = Math.min(2, (plan.scale / 72) * PRINT_DPI);
    const footerY = plan.pageHeight - plan.marginPt + 4;
    const pages: PdfPage[] = [];
    if (plan.overview) {
      const overview = plan.overview;
      const canvas = paint(image, { sx: 0, sy: 0, sw: width, sh: height }, Math.min(pixelsPerUnit, 6000 / Math.max(width, height)));
      pages.push({
        width: plan.pageWidth,
        height: plan.pageHeight,
        images: [{ jpeg: jpegOf(canvas), pixelWidth: canvas.width, pixelHeight: canvas.height, x: overview.x, y: overview.y, width: overview.width, height: overview.height }],
        rects: plan.tiles.map((tile) => ({ x: overview.x + tile.sx * overview.scale, y: overview.y + tile.sy * overview.scale, width: tile.sw * overview.scale, height: tile.sh * overview.scale, lineWidth: 0.75, gray: 0.45 })),
        texts: [
          ...plan.tiles.map((tile, index) => ({ x: overview.x + tile.sx * overview.scale + 5, y: overview.y + tile.sy * overview.scale + 13, size: 10, text: String(index + 1), gray: 0.25 })),
          { x: plan.marginPt, y: footerY, ...LABEL, text: `${input.treeName} · overview of ${plan.tiles.length} sheets · the numbered boxes are the sheets that follow; neighbours overlap, so trim one edge and tape` },
        ],
      });
    }
    for (const tile of plan.tiles) {
      const canvas = paint(image, tile, pixelsPerUnit);
      pages.push({
        width: plan.pageWidth,
        height: plan.pageHeight,
        images: [{ jpeg: jpegOf(canvas), pixelWidth: canvas.width, pixelHeight: canvas.height, x: tile.x, y: tile.y, width: tile.width, height: tile.height }],
        // A hairline round the printed area is the cutting guide.
        rects: tile.label ? [{ x: tile.x, y: tile.y, width: tile.width, height: tile.height, lineWidth: 0.5, gray: 0.6 }] : [],
        texts: tile.label
          ? [
              { x: plan.marginPt, y: footerY, ...LABEL, text: input.treeName },
              { x: plan.pageWidth - plan.marginPt, y: footerY, ...LABEL, text: tile.label, align: 'right' },
            ]
          : [],
      });
    }
    const pdf = buildPdf({ title: input.treeName, pages });
    // Copy into a plain ArrayBuffer: a Uint8Array view isn't a BlobPart under this lib target.
    downloadBlob(exportFilename(input.treeName, 'pdf'), new Blob([pdf.slice().buffer as ArrayBuffer], { type: 'application/pdf' }));
  } finally {
    release();
  }
}
