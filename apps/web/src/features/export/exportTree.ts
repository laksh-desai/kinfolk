import { buildImagePdf } from '@kinfolk/shared/export/pdf';
import { treeSvg } from '@kinfolk/shared/export/treeSvg';
import { writeGedcom } from '@kinfolk/shared/gedcom/gedcom';
import { writeCsv } from '@kinfolk/shared/import/csv';
import type { LayoutResult } from '@kinfolk/shared/layout/layoutTypes';
import type { TreeGraph } from '@kinfolk/shared/schemas/graph';

export type ExportFormat = 'png' | 'pdf' | 'gedcom' | 'csv';

export const EXPORT_LABELS: Record<ExportFormat, string> = {
  png: 'Picture (PNG)',
  pdf: 'Document (PDF)',
  gedcom: 'GEDCOM (.ged)',
  csv: 'Spreadsheet (CSV)',
};

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

interface RasterOptions {
  /** Cap on the long edge, so a 500-person tree doesn't ask the browser for a 90,000px canvas. */
  maxPixels?: number;
}

/** Draws the SVG on a canvas; the browser does the rasterising. */
async function rasterise(svg: string, options: RasterOptions = {}): Promise<HTMLCanvasElement> {
  const maxPixels = options.maxPixels ?? 8000;
  const size = /width="(\d+)" height="(\d+)"/.exec(svg);
  const width = Number(size?.[1] ?? 1200);
  const height = Number(size?.[2] ?? 800);
  const scale = Math.min(2, maxPixels / Math.max(width, height));
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('The picture couldn’t be drawn in this browser.'));
      element.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The picture couldn’t be drawn in this browser.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export interface ExportInput {
  graph: TreeGraph;
  layout: LayoutResult;
  treeName: string;
  relationOf?: (personId: string) => string | null;
}

/** Everything the export menu offers (SPEC §5.3). Each one downloads a real file. */
export async function exportTree(format: ExportFormat, input: ExportInput): Promise<void> {
  if (format === 'gedcom') {
    downloadBlob(exportFilename(input.treeName, 'ged'), new Blob([writeGedcom(input.graph, { treeName: input.treeName })], { type: 'text/plain;charset=utf-8' }));
    return;
  }
  if (format === 'csv') {
    downloadBlob(exportFilename(input.treeName, 'csv'), new Blob([writeCsv(input.graph)], { type: 'text/csv;charset=utf-8' }));
    return;
  }

  const svg = treeSvg(input.graph, input.layout, {
    title: input.treeName,
    relationOf: input.relationOf,
    footer: `Exported from Kinfolk on ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
  });
  const canvas = await rasterise(svg);

  if (format === 'png') {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('The picture couldn’t be saved in this browser.');
    downloadBlob(exportFilename(input.treeName, 'png'), blob);
    return;
  }

  const jpeg = dataUrlToBytes(canvas.toDataURL('image/jpeg', 0.92));
  const pdf = buildImagePdf({ jpeg, pixelWidth: canvas.width, pixelHeight: canvas.height, title: input.treeName });
  // Copy into a plain ArrayBuffer: a Uint8Array view isn't a BlobPart under this lib target.
  downloadBlob(exportFilename(input.treeName, 'pdf'), new Blob([pdf.slice().buffer as ArrayBuffer], { type: 'application/pdf' }));
}
