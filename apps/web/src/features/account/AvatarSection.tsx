import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from '@kinfolk/shared/schemas/account';
import { useRef, useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { FormAlert } from '../../components/FormAlert';
import { announce } from '../../lib/announcer';
import { describeError } from '../../lib/api';
import { queryClient } from '../../lib/queryClient';
import { toast } from '../../lib/toast';
import { sessionQuery, useCurrentUser } from '../auth/sessionQuery';
import { accountApi } from './accountApi';
import { AccountSection } from './AccountSection';

export function AvatarSection() {
  const user = useCurrentUser();
  const inputRef = useRef<HTMLInputElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<'upload' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fullName = `${user.firstName} ${user.lastName}`.trim();

  const fail = (message: string) => {
    setError(message);
    announce(message, 'assertive');
    requestAnimationFrame(() => alertRef.current?.focus());
  };

  const upload = async (file: File) => {
    setError(null);
    if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) return fail('Choose a JPEG, PNG, or WebP image.');
    if (file.size > MAX_IMAGE_BYTES) return fail('Choose an image smaller than 8 MB.');
    setPending('upload');
    try {
      const { user: updated } = await accountApi.uploadAvatar(file);
      queryClient.setQueryData(sessionQuery.queryKey, updated);
      toast({ title: 'Photo updated', tone: 'success' });
    } catch (caught) {
      fail(describeError(caught));
    } finally {
      setPending(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = async () => {
    setError(null);
    setPending('remove');
    try {
      const { user: updated } = await accountApi.removeAvatar();
      queryClient.setQueryData(sessionQuery.queryKey, updated);
      toast({ title: 'Photo removed', tone: 'neutral' });
    } catch (caught) {
      fail(describeError(caught));
    } finally {
      setPending(null);
    }
  };

  return (
    <AccountSection title="Photo" description="Shown to people you share a family tree with. JPEG, PNG, or WebP, up to 8 MB.">
      <div className="flex flex-col gap-4">
        <FormAlert message={error} alertRef={alertRef} />
        <div className="flex flex-wrap items-center gap-5">
          <Avatar name={fullName} src={user.avatarUrl} size="lg" decorative={false} />
          <div className="flex flex-wrap gap-3">
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
            <Button icon="upload" pending={pending === 'upload'} pendingLabel="Uploading…" onClick={() => inputRef.current?.click()}>
              {user.avatarUrl ? 'Change photo' : 'Upload a photo'}
            </Button>
            {user.avatarUrl ? (
              <Button variant="ghost" icon="trash" pending={pending === 'remove'} pendingLabel="Removing…" onClick={() => void remove()}>
                Remove photo
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </AccountSection>
  );
}
