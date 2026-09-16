import { DOCUMENT_TYPE, MAX_DOCUMENT_BYTES, type UploadTargetDto } from '@kinfolk/shared/schemas/account';
import type { Person } from '@kinfolk/shared/schemas/person';
import { useRef, useState } from 'react';
import { Button } from '../../../components/Button';
import { FormAlert } from '../../../components/FormAlert';
import { Icon } from '../../../components/Icon';
import { api, describeError } from '../../../lib/api';
import { uploadToTarget } from '../../account/accountApi';
import { commitWithUndo } from '../editing/changeQueue';

interface PersonRecordFieldProps {
  treeId: string;
  person: Person;
  name: string;
}

/**
 * The public records PDF for one person (ADR 034) — pulled from a government records site by an
 * ATS employee and attached here. Stored first, then attached as an ordinary tree change, so it
 * is audited and undoable like everything else. Only members of this tree can open it.
 */
export function PersonRecordField({ treeId, person, name }: PersonRecordFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const subject = name || 'this person';

  const fail = (message: string) => {
    setError(message);
    requestAnimationFrame(() => alertRef.current?.focus());
  };

  const upload = async (file: File) => {
    setError(null);
    if (file.type !== DOCUMENT_TYPE) return fail('Public records have to be a PDF.');
    if (file.size > MAX_DOCUMENT_BYTES) return fail('Choose a PDF smaller than 25 MB.');
    setPending(true);
    try {
      const base = `/api/trees/${treeId}/people/${person.id}/record`;
      const target = await api<UploadTargetDto>(`${base}/upload-target`, { method: 'POST', body: { contentType: file.type, size: file.size } });
      await uploadToTarget(target, file);
      const { publicRecordUrl } = await api<{ publicRecordUrl: string }>(base, { method: 'POST', body: { key: target.key } });
      void commitWithUndo(
        treeId,
        [{ op: 'person.update', id: person.id, patch: { publicRecordUrl } }],
        `Attached public records for ${subject}`,
        `Public records attached for ${subject}.`,
      ).catch(() => undefined);
    } catch (caught) {
      fail(describeError(caught));
    } finally {
      setPending(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = () => {
    setError(null);
    try {
      void commitWithUndo(
        treeId,
        [{ op: 'person.update', id: person.id, patch: { publicRecordUrl: null } }],
        `Removed public records for ${subject}`,
        `Public records removed for ${subject}.`,
      ).catch(() => undefined);
    } catch (caught) {
      fail(describeError(caught));
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <FormAlert message={error} alertRef={alertRef} />
      {person.publicRecordUrl ? (
        <p className="flex items-center gap-2 rounded-control border border-line bg-sunken px-3 py-2 text-base">
          <Icon name="file" className="size-5 shrink-0 text-accent" />
          <a href={person.publicRecordUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent underline">
            Open {subject}’s public records
            <span className="sr-only"> (PDF, opens in a new tab)</span>
          </a>
          <Icon name="external" className="size-4 shrink-0 text-ink-muted" />
        </p>
      ) : (
        <p className="text-base text-ink-muted">No public records attached yet.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <Button icon="upload" pending={pending} pendingLabel="Uploading…" onClick={() => inputRef.current?.click()}>
          {person.publicRecordUrl ? 'Replace the PDF' : 'Attach a PDF'}
        </Button>
        {person.publicRecordUrl ? (
          <Button variant="ghost" icon="trash" onClick={remove}>
            Remove records
          </Button>
        ) : null}
      </div>
      <p className="text-sm text-ink-muted">
        A PDF up to 25 MB, pulled from public records. Everyone with access to this tree can open it; a share link never shows it. Changes save straight away.
      </p>
    </div>
  );
}
