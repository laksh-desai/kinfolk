import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { Menu, MenuItem, MenuNote } from '../../components/Menu';
import { announce } from '../../lib/announcer';
import { describeError } from '../../lib/api';
import { toast } from '../../lib/toast';
import { EXPORT_LABELS, type ExportFormat } from './exportFormats';
import type { ExportInput } from './exportTree';

const ICONS: Record<ExportFormat, 'image' | 'file' | 'download'> = { png: 'image', pdf: 'file', gedcom: 'download', csv: 'download' };

/** Export the tree as a picture, a document, or a file another tool can read (SPEC §5.3). */
export function ExportMenu({ input }: { input: ExportInput }) {
  const [busy, setBusy] = useState<ExportFormat | null>(null);

  const run = async (format: ExportFormat) => {
    setBusy(format);
    announce(`Preparing your ${EXPORT_LABELS[format]} download…`);
    try {
      // The exporters are their own chunk, fetched the first time someone exports.
      const { exportTree } = await import('./exportTree');
      await exportTree(format, input);
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
          aria-label={busy ? `Preparing ${EXPORT_LABELS[busy]}` : 'Export this family tree'}
        >
          <Icon name="download" />
          Export
        </button>
      }
      label="Download this tree as"
    >
      {(['png', 'pdf', 'gedcom', 'csv'] as const).map((format) => (
        <MenuItem
          key={format}
          icon={ICONS[format]}
          onSelect={(event) => {
            // Keep the menu open long enough to start the work; closing cancels nothing.
            event.preventDefault();
            void run(format);
          }}
        >
          {EXPORT_LABELS[format]}
          {busy === format ? <span className="ml-auto text-sm text-ink-muted">Preparing…</span> : null}
        </MenuItem>
      ))}
      <MenuNote>GEDCOM and CSV can be opened by other family-tree tools and spreadsheets.</MenuNote>
    </Menu>
  );
}
