import type { ShareLinkDto } from '@kinfolk/shared/schemas/collaboration';
import { useQuery } from '@tanstack/react-query';
import { useId, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ErrorState } from '../../components/ErrorState';
import { inputClasses } from '../../components/fieldStyles';
import { Skeleton } from '../../components/Skeleton';
import { announce } from '../../lib/announcer';
import { describeError } from '../../lib/api';
import { queryClient } from '../../lib/queryClient';
import { relativeTime } from '../../lib/relativeTime';
import { toast } from '../../lib/toast';
import { collaborationApi, shareLinksQuery } from './collaborationApi';

const EXPIRY = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: 'never', label: 'Until I turn it off' },
];

const date = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

function linkSummary(link: ShareLinkDto): string {
  const created = `Created ${relativeTime(link.createdAt)}${link.createdBy ? ` by ${link.createdBy}` : ''}`;
  if (link.status === 'revoked') return `${created} · Turned off`;
  if (link.status === 'expired') return `${created} · Expired ${link.expiresAt ? date(link.expiresAt) : ''}`;
  return `${created} · ${link.expiresAt ? `Works until ${date(link.expiresAt)}` : 'No expiry'}`;
}

/** Read-only share links with copy, optional expiry, and revoke (SPEC §5.6). */
export function ShareLinksSection({ treeId }: { treeId: string }) {
  const expiryId = useId();
  const urlId = useId();
  const urlRef = useRef<HTMLInputElement>(null);
  const links = useQuery(shareLinksQuery(treeId));
  const [expiry, setExpiry] = useState('30');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<ShareLinkDto | null>(null);

  const create = async () => {
    setCreating(true);
    setCopyNote(null);
    try {
      const result = await collaborationApi.createShareLink(treeId, expiry === 'never' ? null : (Number(expiry) as 7 | 30 | 90));
      setCreated(result.url);
      await queryClient.invalidateQueries({ queryKey: shareLinksQuery(treeId).queryKey });
      announce('Share link created. Copy it now; it can’t be shown again.');
      requestAnimationFrame(() => urlRef.current?.select());
    } catch (error) {
      toast({ title: 'Link not created', description: describeError(error), tone: 'error' });
    } finally {
      setCreating(false);
    }
  };

  const copy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created);
      setCopyNote('Copied to your clipboard.');
    } catch {
      urlRef.current?.select();
      setCopyNote('Your browser didn’t allow copying. The link is selected — press Ctrl+C (⌘C on a Mac).');
    }
  };

  return (
    <section aria-labelledby="share-links-heading" className="flex flex-col gap-3">
      <div>
        <h3 id="share-links-heading" className="text-base font-semibold">
          Share a read-only link
        </h3>
        <p className="text-sm text-ink-muted">
          Anyone with the link sees names, relationships, and birth years — never contact details, addresses, notes, or planning answers. No account needed.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor={expiryId} className="mb-1 block text-sm font-semibold text-ink-muted">
            Link works for
          </label>
          <select id={expiryId} value={expiry} onChange={(event) => setExpiry(event.target.value)} className={inputClasses(false, 'w-auto pr-8')}>
            {EXPIRY.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <Button icon="link" onClick={() => void create()} pending={creating} pendingLabel="Creating…">
          Create link
        </Button>
      </div>

      {created ? (
        <div className="flex flex-col gap-2 rounded-card border border-accent/40 bg-accent-soft/30 p-3">
          <label htmlFor={urlId} className="text-sm font-semibold">
            Your new link — copy it now; for your security it can’t be shown again
          </label>
          <div className="flex flex-wrap gap-2">
            <input id={urlId} ref={urlRef} readOnly value={created} className={inputClasses(false, 'min-w-0 flex-1 basis-60 font-mono text-sm')} onFocus={(event) => event.target.select()} />
            <Button variant="primary" icon="copy" onClick={() => void copy()}>
              Copy link
            </Button>
          </div>
          {copyNote ? (
            <p role="status" className="text-sm">
              {copyNote}
            </p>
          ) : null}
        </div>
      ) : null}

      {links.isPending ? (
        <div role="status" aria-busy="true" className="flex flex-col gap-2">
          <span className="sr-only">Loading share links</span>
          <Skeleton className="h-12 w-full" />
        </div>
      ) : links.isError ? (
        <ErrorState error={links.error} title="Share links didn’t load" onRetry={() => void links.refetch()} retrying={links.isRefetching} className="py-4" />
      ) : links.data.length > 0 ? (
        <ul aria-label="Share links" className="flex flex-col divide-y divide-line rounded-card border border-line">
          {links.data.map((link) => (
            <li key={link.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
              <p className="min-w-0 flex-1 basis-48 text-sm">{linkSummary(link)}</p>
              {link.status === 'active' ? (
                <Button variant="danger-quiet" onClick={() => setRevoking(link)} aria-label={`Turn off the link created ${relativeTime(link.createdAt)}`}>
                  Turn off
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => !open && setRevoking(null)}
        title="Turn off this link?"
        confirmLabel="Turn off link"
        pendingLabel="Turning off…"
        onConfirm={async () => {
          if (!revoking) return;
          await collaborationApi.revokeShareLink(treeId, revoking.id);
          await queryClient.invalidateQueries({ queryKey: shareLinksQuery(treeId).queryKey });
          toast({ title: 'Link turned off', tone: 'neutral' });
        }}
      >
        <p>Anyone who opens it will see a message that the link was turned off. You can create a new link anytime.</p>
      </ConfirmDialog>
    </section>
  );
}
