import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES, type UploadTargetDto } from '@kinfolk/shared/schemas/account';
import type { Person } from '@kinfolk/shared/schemas/person';
import { useRef, useState } from 'react';
import { Avatar } from '../../../components/Avatar';
import { Button } from '../../../components/Button';
import { FormAlert } from '../../../components/FormAlert';
import { api, describeError } from '../../../lib/api';
import { uploadToTarget } from '../../account/accountApi';
import { commitWithUndo } from '../editing/changeQueue';

interface PersonPhotoFieldProps {
  treeId: string;
  person: Person;
  name: string;
}

/**
 * Photo upload for a person. The image is stored first; attaching it is an ordinary tree change,
 * so it shows immediately, saves with the rest, and can be undone.
 */
export function PersonPhotoField({ treeId, person, name }: PersonPhotoFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const subject = name || 'this person';

  const fail = (message: string) => {
    setError(message);
    // Focusing the alert reads it out; a live-region announcement as well would say it twice.
    requestAnimationFrame(() => alertRef.current?.focus());
  };

  const upload = async (file: File) => {
    setError(null);
    if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) return fail('Choose a JPEG, PNG, or WebP image.');
    if (file.size > MAX_IMAGE_BYTES) return fail('Choose an image smaller than 8 MB.');
    setPending(true);
    try {
      const base = `/api/trees/${treeId}/people/${person.id}/photo`;
      const target = await api<UploadTargetDto>(`${base}/upload-target`, { method: 'POST', body: { contentType: file.type, size: file.size } });
      await uploadToTarget(target, file);
      const { photoUrl } = await api<{ photoUrl: string }>(base, { method: 'POST', body: { key: target.key } });
      void commitWithUndo(treeId, [{ op: 'person.update', id: person.id, patch: { photoUrl } }], `Changed ${subject}’s photo`, `Photo updated for ${subject}.`).catch(() => undefined);
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
      void commitWithUndo(treeId, [{ op: 'person.update', id: person.id, patch: { photoUrl: null } }], `Removed ${subject}’s photo`, `Photo removed for ${subject}.`).catch(() => undefined);
    } catch (caught) {
      fail(describeError(caught));
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <FormAlert message={error} alertRef={alertRef} />
      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={name} src={person.photoUrl} size="lg" decorative={false} />
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={ALLOWED_IMAGE_TYPES.join(',')}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <Button icon="upload" pending={pending} pendingLabel="Uploading…" onClick={() => inputRef.current?.click()}>
            {person.photoUrl ? 'Change photo' : 'Add a photo'}
          </Button>
          {person.photoUrl ? (
            <Button variant="ghost" icon="trash" onClick={remove}>
              Remove photo
            </Button>
          ) : null}
        </div>
      </div>
      <p className="text-sm text-ink-muted">JPEG, PNG, or WebP, up to 8 MB. Changes to the photo save straight away.</p>
    </div>
  );
}
