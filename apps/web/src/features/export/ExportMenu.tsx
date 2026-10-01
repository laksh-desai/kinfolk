import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { Menu, MenuItem, MenuNote } from '../../components/Menu';
import { announce } from '../../lib/announcer';
import { describeError } from '../../lib/api';
import { toast } from '../../lib/toast';
import { EXPORT_LABELS, type ExportFormat } from './exportFormats';
import type { ExportInput, ExportOptions } from './exportTree';

const ICONS: Record<ExportFormat, 'image' | 'file' | 'download'> = { png: 'image', pdf: 'file', gedcom: 'download', csv: 'download' };

/** What the menu offers: the PDF comes on either paper, since it will be printed. */
const CHOICES: Array<{ key: string; format: ExportFormat; label: string; options?: ExportOptions }> = [
  { key: 'png', format: 'png', label: EXPORT_LABELS.png },
  { key: 'pdf-letter', format: 'pdf', label: `${EXPORT_LABELS.pdf}, Letter`, options: { paper: 'letter' } },
  { key: 'pdf-a4', format: 'pdf', label: `${EXPORT_LABELS.pdf}, A4`, options: { paper: 'a4' } },
  { key: 'gedcom', format: 'gedcom', label: EXPORT_LABELS.gedcom },
  { key: 'csv', format: 'csv', label: EXPORT_LABELS.csv },
];

/** Export the tree as a picture, a document, or a file another tool can read (SPEC §5.3). */
export function ExportMenu({ input }: { input: ExportInput }) {
  const [busy, setBusy] = useState<string | null>(null);

  const run = async ({ key, format, options }: (typeof CHOICES)[number]) => {
    setBusy(key);
    announce(`Preparing your ${EXPORT_LABELS[format]} download…`);
    try {
      // The exporters are their own chunk, fetched the first time someone exports.
      const { exportTree } = await import('./exportTree');
      await exportTree(format, input, options);
      announce(`${EXPORT_LABELS[format]} downloaded.`);
    } catch (error) {
      toast({ title: 'That export didn’t work', description: describeError(error), tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Menu
      trigger={
        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-2 rounded-control border border-line-strong bg-surface px-3 text-base font-semibold text-ink hover:bg-sunken"
          aria-label={busy ? `Preparing ${CHOICES.find((choice) => choice.key === busy)?.label ?? 'your download'}` : 'Export this family tree'}
        >
          <Icon name="download" />
          Export
        </button>
      }
      label="Download this tree as"
    >
      {CHOICES.map((choice) => (
        <MenuItem
          key={choice.key}
          icon={ICONS[choice.format]}
          onSelect={(event) => {
            // Keep the menu open long enough to start the work; closing cancels nothing.
            event.preventDefault();
            void run(choice);
          }}
        >
          {choice.label}
          {busy === choice.key ? <span className="ml-auto text-sm text-ink-muted">Preparing…</span> : null}
        </MenuItem>
      ))}
      <MenuNote>The PDF prints across as many sheets as the tree needs. GEDCOM and CSV open in other family-tree tools and spreadsheets.</MenuNote>
    </Menu>
  );
}
