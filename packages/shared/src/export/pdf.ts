export interface PdfImage {
  /** JPEG bytes, as a browser canvas produces with toDataURL('image/jpeg'). */
  jpeg: Uint8Array;
  pixelWidth: number;
  pixelHeight: number;
  /** Where it goes on the page, in points, measured from the top left like a screen. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfText {
  x: number;
  /** The baseline, from the top of the page. */
  y: number;
  size: number;
  text: string;
  /** 0 is black, 1 is white. */
  gray?: number;
  align?: 'left' | 'center' | 'right';
}

export interface PdfRect {
  x: number;
  y: number;
  width: number;
  height: number;
  lineWidth?: number;
  gray?: number;
}

export interface PdfPage {
  width: number;
  height: number;
  images?: PdfImage[];
  texts?: PdfText[];
  rects?: PdfRect[];
}

export interface PdfDocument {
  title: string;
  pages: PdfPage[];
}

/** Helvetica's average glyph width, as a fraction of the size — enough to centre or right-align a label. */
const AVERAGE_GLYPH = 0.5;

export function textWidth(text: string, size: number): number {
  return text.length * size * AVERAGE_GLYPH;
}

const pdfString = (value: string) => value.replace(/[\\()]/g, '\\$&').replace(/[^\x20-\x7e]/g, (char) => (char === '·' ? '\\267' : char === '…' ? '...' : '?'));

/**
 * A PDF with pictures, labels and boxes, from scratch. PDF carries JPEG natively (DCTDecode) and
 * ships Helvetica, so a document of sheets needs no library. Pure: bytes out, nothing else.
 */
export function buildPdf(document: PdfDocument): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (bytes: Uint8Array) => {
    chunks.push(bytes);
    length += bytes.length;
  };
  const text = (value: string) => push(encoder.encode(value));
  let nextId = 1;
  const object = (body: () => void) => {
    const id = nextId;
    nextId += 1;
    offsets[id] = length;
    text(`${id} 0 obj\n`);
    body();
    text('\nendobj\n');
    return id;
  };

  text('%PDF-1.4\n%âãÏÓ\n');
  const catalogId = nextId;
  nextId += 1;
  const pagesId = nextId;
  nextId += 1;
  const fontId = object(() => text('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'));

  const pageIds: number[] = [];
  for (const page of document.pages) {
    const imageIds: number[] = [];
    for (const image of page.images ?? []) {
      imageIds.push(
        object(() => {
          text(`<< /Type /XObject /Subtype /Image /Width ${image.pixelWidth} /Height ${image.pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.jpeg.length} >>\nstream\n`);
          push(image.jpeg);
          text('\nendstream');
        }),
      );
    }
    const ops: string[] = [];
    (page.images ?? []).forEach((image, index) => {
      // PDF's origin is the bottom left; ours is the top left.
      const bottom = page.height - image.y - image.height;
      ops.push(`q\n${image.width.toFixed(2)} 0 0 ${image.height.toFixed(2)} ${image.x.toFixed(2)} ${bottom.toFixed(2)} cm\n/Im${index} Do\nQ`);
    });
    for (const rect of page.rects ?? []) {
      const bottom = page.height - rect.y - rect.height;
      ops.push(`q\n${(rect.gray ?? 0).toFixed(2)} G\n${(rect.lineWidth ?? 1).toFixed(2)} w\n${rect.x.toFixed(2)} ${bottom.toFixed(2)} ${rect.width.toFixed(2)} ${rect.height.toFixed(2)} re\nS\nQ`);
    }
    for (const label of page.texts ?? []) {
      const width = textWidth(label.text, label.size);
      const x = label.align === 'center' ? label.x - width / 2 : label.align === 'right' ? label.x - width : label.x;
      ops.push(`BT\n/F1 ${label.size.toFixed(2)} Tf\n${(label.gray ?? 0).toFixed(2)} g\n${x.toFixed(2)} ${(page.height - label.y).toFixed(2)} Td\n(${pdfString(label.text)}) Tj\nET`);
    }
    const content = `${ops.join('\n')}\n`;
    const contentId = object(() => text(`<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream`));
    const xobjects = imageIds.map((id, index) => `/Im${index} ${id} 0 R`).join(' ');
    pageIds.push(
      object(() =>
        text(
          `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${page.width.toFixed(2)} ${page.height.toFixed(2)}] /Resources << /Font << /F1 ${fontId} 0 R >> /XObject << ${xobjects} >> >> /Contents ${contentId} 0 R >>`,
        ),
      ),
    );
  }

  offsets[catalogId] = length;
  text(`${catalogId} 0 obj\n<< /Type /Catalog /Pages ${pagesId} 0 R >>\nendobj\n`);
  offsets[pagesId] = length;
  text(`${pagesId} 0 obj\n<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>\nendobj\n`);
  const infoId = object(() => text(`<< /Title (${pdfString(document.title)}) /Producer (Kinfolk) >>`));

  const xrefOffset = length;
  const size = nextId;
  const rows = ['xref\n', `0 ${size}\n`, '0000000000 65535 f \n'];
  for (let id = 1; id < size; id += 1) rows.push(`${(offsets[id] ?? 0).toString().padStart(10, '0')} 00000 n \n`);
  text(rows.join(''));
  text(`trailer\n<< /Size ${size} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let position = 0;
  for (const chunk of chunks) {
    out.set(chunk, position);
    position += chunk.length;
  }
  return out;
}

export interface PdfImageOptions {
  jpeg: Uint8Array;
  pixelWidth: number;
  pixelHeight: number;
  title: string;
}

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 28;

/** One A4 page holding one picture, fitted and centred; landscape or portrait follows the picture. */
export function buildImagePdf(options: PdfImageOptions): Uint8Array {
  const landscape = options.pixelWidth > options.pixelHeight;
  const pageWidth = landscape ? A4_HEIGHT : A4_WIDTH;
  const pageHeight = landscape ? A4_WIDTH : A4_HEIGHT;
  const scale = Math.min((pageWidth - MARGIN * 2) / options.pixelWidth, (pageHeight - MARGIN * 2) / options.pixelHeight);
  const width = options.pixelWidth * scale;
  const height = options.pixelHeight * scale;
  return buildPdf({
    title: options.title,
    pages: [{ width: pageWidth, height: pageHeight, images: [{ jpeg: options.jpeg, pixelWidth: options.pixelWidth, pixelHeight: options.pixelHeight, x: (pageWidth - width) / 2, y: (pageHeight - height) / 2, width, height }] }],
  });
}
