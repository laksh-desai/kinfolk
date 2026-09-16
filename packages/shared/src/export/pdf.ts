export interface PdfImageOptions {
  /** JPEG bytes, as a browser canvas produces with toDataURL('image/jpeg'). */
  jpeg: Uint8Array;
  pixelWidth: number;
  pixelHeight: number;
  title: string;
}

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 28;

/**
 * A one-page PDF holding a picture of the tree. PDF carries JPEG natively (DCTDecode), so this
 * needs no library: the browser rasterises the SVG, and these few objects wrap it.
 * Landscape or portrait follows the picture, and the page is A4 so it prints as expected.
 */
export function buildImagePdf(options: PdfImageOptions): Uint8Array {
  const landscape = options.pixelWidth > options.pixelHeight;
  const pageWidth = landscape ? A4_HEIGHT : A4_WIDTH;
  const pageHeight = landscape ? A4_WIDTH : A4_HEIGHT;
  const scale = Math.min((pageWidth - MARGIN * 2) / options.pixelWidth, (pageHeight - MARGIN * 2) / options.pixelHeight);
  const drawWidth = options.pixelWidth * scale;
  const drawHeight = options.pixelHeight * scale;
  const x = (pageWidth - drawWidth) / 2;
  const y = (pageHeight - drawHeight) / 2;

  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (bytes: Uint8Array) => {
    chunks.push(bytes);
    length += bytes.length;
  };
  const text = (value: string) => push(encoder.encode(value));
  const startObject = () => {
    offsets.push(length);
  };

  const content = `q\n${drawWidth.toFixed(2)} 0 0 ${drawHeight.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm\n/Im0 Do\nQ\n`;
  const title = options.title.replace(/[\\()]/g, '\\$&');

  text('%PDF-1.4\n%âãÏÓ\n');
  startObject();
  text('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  startObject();
  text('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  startObject();
  text(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(2)}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>\nendobj\n`);
  startObject();
  text(`4 0 obj\n<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`);
  startObject();
  text(`5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${options.pixelWidth} /Height ${options.pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${options.jpeg.length} >>\nstream\n`);
  push(options.jpeg);
  text('\nendstream\nendobj\n');
  startObject();
  text(`6 0 obj\n<< /Title (${title}) /Producer (Kinfolk) >>\nendobj\n`);

  const xrefOffset = length;
  const rows = ['xref\n0 7\n0000000000 65535 f \n', ...offsets.map((offset) => `${offset.toString().padStart(10, '0')} 00000 n \n`)].join('');
  text(rows);
  text(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let position = 0;
  for (const chunk of chunks) {
    out.set(chunk, position);
    position += chunk.length;
  }
  return out;
}
