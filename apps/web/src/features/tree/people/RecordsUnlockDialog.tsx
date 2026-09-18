import { recordsUnlockSchema, type RecordsStateDto } from '@kinfolk/shared/schemas/account';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useRef, useState } from 'react';
import { Button } from '../../../components/Button';
import { Dialog } from '../../../components/Dialog';
import { FormAlert } from '../../../components/FormAlert';
import { inputClasses } from '../../../components/fieldStyles';
import { api, describeError } from '../../../lib/api';

export const recordsStateQuery = {
  queryKey: ['records-state'] as const,
  queryFn: () => api<RecordsStateDto>('/api/records/state'),
};

/** Does this browser still need the passphrase before it can reach public records? */
export function useRecordsLock() {
  const state = useQuery(recordsStateQuery);
  return { locked: state.data ? state.data.required && !state.data.unlocked : false, ready: !state.isPending };
}

interface RecordsUnlockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Runs once the passphrase is accepted — opening the PDF, or starting the upload. */
  onUnlocked: () => void;
}

/**
 * Asks for the shared passphrase before public records can be opened or replaced (ADR 037).
 * The passphrase is checked by the server, which then trusts this browser for half an hour;
 * nothing about it is kept here.
 */
export function RecordsUnlockDialog({ open, onOpenChange, onUnlocked }: RecordsUnlockDialogProps) {
  const inputId = useId();
  const alertRef = useRef<HTMLDivElement>(null);
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const queryClient = useQueryClient();

  const submit = async () => {
    const parsed = recordsUnlockSchema.safeParse({ passphrase });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter the passphrase for public records.');
      requestAnimationFrame(() => alertRef.current?.focus());
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api('/api/records/unlock', { method: 'POST', body: parsed.data });
      await queryClient.invalidateQueries({ queryKey: recordsStateQuery.queryKey });
      setPassphrase('');
      onOpenChange(false);
      // Called from the submit handler, so a browser still counts this as the same click and
      // lets the PDF open in a new tab.
      onUnlocked();
    } catch (caught) {
      setError(describeError(caught));
      requestAnimationFrame(() => alertRef.current?.focus());
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setPassphrase('');
          setError(null);
        }
        onOpenChange(next);
      }}
      title="Public records are protected"
      description="Enter the passphrase to open or replace this person’s records. It is remembered for half an hour."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" icon="lock" pending={pending} pendingLabel="Checking…" onClick={() => void submit()}>
            Unlock
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <FormAlert message={error} alertRef={alertRef} />
        <label htmlFor={inputId} className="text-base font-semibold">
          Passphrase
        </label>
        <input
          id={inputId}
          type="password"
          value={passphrase}
          autoComplete="off"
          className={inputClasses(Boolean(error))}
          onChange={(event) => setPassphrase(event.target.value)}
        />
        {/* Enter submits: a form needs a submit control for that. The footer button is the one
            people see and screen readers announce, so this one stays out of both. */}
        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">
          Unlock
        </button>
      </form>
    </Dialog>
  );
}
