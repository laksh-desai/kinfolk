// The menu needs only these; the exporters themselves (SVG, PDF, GEDCOM, CSV writers) load when
// a format is chosen, so the tree page does not carry them for the one visit in fifty that exports.
export type ExportFormat = 'png' | 'pdf' | 'gedcom' | 'csv';

export const EXPORT_LABELS: Record<ExportFormat, string> = {
  png: 'Picture (PNG)',
  pdf: 'Document (PDF)',
  gedcom: 'GEDCOM (.ged)',
  csv: 'Spreadsheet (CSV)',
};
