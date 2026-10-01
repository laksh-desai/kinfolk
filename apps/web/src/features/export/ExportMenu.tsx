import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { announce } from '../../lib/announcer';
import { describeError } from '../../lib/api';
import { cx } from '../../lib/cx';
import { toast } from '../../lib/toast';
import { EXPORT_LABELS, type ExportFormat } from './exportFormats';
import type { ExportInput } from './exportTree';

const itemClass = 'flex min-h-11 cursor-pointer select-none items-center gap-3 rounded-md px-3 text-base text-ink outline-none data-[highlighted]:bg-sunken';

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
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={cx('inline-flex min-h-11 items-center gap-2 rounded-control border border-line-strong bg-surface px-3 text-base font-semibold text-ink hover:bg-sunken')}
        aria-label={busy ? `Preparing ${EXPORT_LABELS[busy]}` : 'Export this family tree'}
      >
        <Icon name="download" />
        Export
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} collisionPadding={12} className="z-50 min-w-60 max-w-[calc(100vw-1.5rem)] rounded-card border border-line bg-surface p-1.5 shadow-card">
          <DropdownMenu.Label className="px-3 py-1.5 text-sm font-semibold text-ink-muted">Download this tree as</DropdownMenu.Label>
          {(['png', 'pdf', 'gedcom', 'csv'] as const).map((format) => (
            <DropdownMenu.Item
              key={format}
              className={itemClass}
              onSelect={(event) => {
                // Keep the menu open long enough to start the work; closing cancels nothing.
                event.preventDefault();
                void run(format);
              }}
            >
              <Icon name={ICONS[format]} />
              {EXPORT_LABELS[format]}
              {busy === format ? <span className="ml-auto text-sm text-ink-muted">Preparing…</span> : null}
            </DropdownMenu.Item>
          ))}
          <p className="px-3 py-1.5 text-sm text-ink-muted">GEDCOM and CSV can be opened by other family-tree tools and spreadsheets.</p>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
