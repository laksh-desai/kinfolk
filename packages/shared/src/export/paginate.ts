export type Paper = 'letter' | 'a4';

/** Portrait dimensions in PDF points (1/72 in). The tree is always printed landscape. */
export const PAPER_SIZES: Record<Paper, { width: number; height: number }> = {
  letter: { width: 612, height: 792 },
  a4: { width: 595.28, height: 841.89 },
};

export interface PaginateOptions {
  paper?: Paper;
  /** Page margin in points. */
  marginPt?: number;
  /** Room under the picture on every sheet for its label. */
  footerPt?: number;
  /** A card's width in the picture's own units (layout pixels). */
  cardWidthPx?: number;
  /** The narrowest a card may print, in points: below this names stop being legible. */
  minCardWidthPt?: number;
  /** How much neighbouring sheets repeat, in points, so a card cut by the edge is whole on one of them. */
  overlapPt?: number;
}

export interface SheetTile {
  /** 1-based. */
  row: number;
  column: number;
  /** The region of the picture on this sheet, in picture units. */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Where that region lands on the page, in points. */
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

export interface PagePlan {
  paper: Paper;
  /** Landscape. */
  pageWidth: number;
  pageHeight: number;
  marginPt: number;
  footerPt: number;
  /** Points per picture unit on the sheets. */
  scale: number;
  rows: number;
  columns: number;
  tiles: SheetTile[];
  /**
   * When there is more than one sheet: the whole picture on one page, with the sheet grid over
   * it, so the reader knows which sheet is where. Same page size; `scale` is its own.
   */
  overview: { scale: number; x: number; y: number; width: number; height: number } | null;
}

/**
 * Cuts a picture into landscape sheets a person can print and tape together (SPEC §5.3). A
 * small tree fits one sheet; a large one is tiled at a scale where a card is still legible,
 * with neighbouring sheets overlapping so nothing is lost in the cut. Pure: numbers in, numbers out.
 */
export function planPages(pictureWidth: number, pictureHeight: number, options: PaginateOptions = {}): PagePlan {
  const paper = options.paper ?? 'letter';
  const marginPt = options.marginPt ?? 28;
  const footerPt = options.footerPt ?? 18;
  const cardWidthPx = options.cardWidthPx ?? 176;
  const minCardWidthPt = options.minCardWidthPt ?? 110;
  const overlapPt = options.overlapPt ?? 36;
  const portrait = PAPER_SIZES[paper];
  const pageWidth = Math.max(portrait.width, portrait.height);
  const pageHeight = Math.min(portrait.width, portrait.height);
  const areaWidth = pageWidth - marginPt * 2;
  const areaHeight = pageHeight - marginPt * 2 - footerPt;

  const fitScale = Math.min(areaWidth / pictureWidth, areaHeight / pictureHeight);
  const minScale = minCardWidthPt / cardWidthPx;

  if (fitScale >= minScale) {
    const width = pictureWidth * fitScale;
    const height = pictureHeight * fitScale;
    return {
      paper,
      pageWidth,
      pageHeight,
      marginPt,
      footerPt,
      scale: fitScale,
      rows: 1,
      columns: 1,
      tiles: [{ row: 1, column: 1, sx: 0, sy: 0, sw: pictureWidth, sh: pictureHeight, x: marginPt + (areaWidth - width) / 2, y: marginPt + (areaHeight - height) / 2, width, height, label: '' }],
      overview: null,
    };
  }

  const scale = minScale;
  const tileWidth = areaWidth / scale;
  const tileHeight = areaHeight / scale;
  const overlap = overlapPt / scale;
  const stepX = tileWidth - overlap;
  const stepY = tileHeight - overlap;
  const columns = Math.max(1, Math.ceil((pictureWidth - overlap) / stepX));
  const rows = Math.max(1, Math.ceil((pictureHeight - overlap) / stepY));
  const total = rows * columns;
  const tiles: SheetTile[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const sx = column * stepX;
      const sy = row * stepY;
      const sw = Math.min(tileWidth, pictureWidth - sx);
      const sh = Math.min(tileHeight, pictureHeight - sy);
      tiles.push({
        row: row + 1,
        column: column + 1,
        sx,
        sy,
        sw,
        sh,
        x: marginPt,
        y: marginPt,
        width: sw * scale,
        height: sh * scale,
        label: `Sheet ${tiles.length + 1} of ${total} · row ${row + 1}, column ${column + 1}`,
      });
    }
  }
  const overviewScale = fitScale;
  const overviewWidth = pictureWidth * overviewScale;
  const overviewHeight = pictureHeight * overviewScale;
  return {
    paper,
    pageWidth,
    pageHeight,
    marginPt,
    footerPt,
    scale,
    rows,
    columns,
    tiles,
    overview: { scale: overviewScale, x: marginPt + (areaWidth - overviewWidth) / 2, y: marginPt + (areaHeight - overviewHeight) / 2, width: overviewWidth, height: overviewHeight },
  };
}
