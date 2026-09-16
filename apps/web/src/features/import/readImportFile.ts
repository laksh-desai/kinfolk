import { parseGedcom, type GedcomImport } from '@kinfolk/shared/gedcom/gedcom';
import { guessMapping, parseCsv, type CsvMapping } from '@kinfolk/shared/import/csv';

export type ImportFile =
  | { kind: 'csv'; name: string; rows: string[][]; mapping: CsvMapping }
  | { kind: 'gedcom'; name: string; text: string };

export class ImportFileError extends Error {}

/** Blob.text() is missing in older browsers (and in jsdom), so fall back to FileReader. */
export function readFileText(file: Blob): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('That file couldn’t be read. Try saving it again, then choose it once more.'));
    reader.readAsText(file);
  });
}

const MAX_BYTES = 8 * 1024 * 1024;

/** Works out what kind of file this is and reads it, or says plainly why it can't. */
export function readImportFile(name: string, text: string, size = text.length): ImportFile {
  if (size > MAX_BYTES) throw new ImportFileError('That file is larger than 8 MB. Split it up, or ask us to raise the limit.');
  const looksGedcom = /^\s*0\s+HEAD\b/m.test(text) || /\n0 @[^@]+@ INDI/.test(text);
  if (name.toLowerCase().endsWith('.ged') || looksGedcom) {
    if (!looksGedcom) throw new ImportFileError('That doesn’t look like a GEDCOM file: it has no HEAD record.');
    return { kind: 'gedcom', name, text };
  }
  const rows = parseCsv(text);
  if (rows.length < 2) throw new ImportFileError('That file has no rows to import — it needs a header row and at least one person.');
  const headers = rows[0] as string[];
  const mapping = guessMapping(headers);
  if (mapping.firstName === undefined) {
    throw new ImportFileError('We couldn’t find a first-name column. Check the file has a header row, then choose the columns below.');
  }
  return { kind: 'csv', name, rows, mapping };
}

export function gedcomPreview(file: Extract<ImportFile, { kind: 'gedcom' }>, newId: () => string): GedcomImport {
  return parseGedcom(file.text, { newId });
}
