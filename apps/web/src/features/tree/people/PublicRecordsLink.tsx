import { useState } from 'react';
import { Icon } from '../../../components/Icon';
import { RecordsUnlockDialog, useRecordsLock } from './RecordsUnlockDialog';

/**
 * Opens a person's public records in a new tab, asking for the passphrase first when this
 * deployment wants one (ADR 037). A plain link would skip the prompt and land the reader on a
 * refusal, so this is a button that opens the tab once the server has let it through.
 */
export function PublicRecordsLink({ url, name }: { url: string; name: string }) {
  const [asking, setAsking] = useState(false);
  const { locked } = useRecordsLock();
  const open = () => window.open(url, '_blank', 'noopener,noreferrer');

  return (
    <>
      <button
        type="button"
        onClick={() => (locked ? setAsking(true) : open())}
        className="inline-flex items-center gap-2 rounded-control border border-line bg-sunken px-3 py-2 text-base font-semibold text-accent underline"
      >
        <Icon name={locked ? 'lock' : 'file'} className="size-5 shrink-0" />
        Public records
        <span className="sr-only">
          for {name} (PDF, opens in a new tab{locked ? ', passphrase needed' : ''})
        </span>
        <Icon name="external" className="size-4 shrink-0 text-ink-muted" />
      </button>
      <RecordsUnlockDialog open={asking} onOpenChange={setAsking} onUnlocked={open} />
    </>
  );
}
