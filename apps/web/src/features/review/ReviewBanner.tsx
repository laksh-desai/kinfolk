import type { TreeDto } from '@kinfolk/shared/schemas/tree';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { announce } from '../../lib/announcer';
import { describeError } from '../../lib/api';
import { cx } from '../../lib/cx';
import { queryClient } from '../../lib/queryClient';
import { relativeTime } from '../../lib/relativeTime';
import { toast } from '../../lib/toast';
import { inboxQuery } from '../collaboration/collaborationApi';
import { treesQuery } from '../dashboard/treesApi';
import { treeGraphQuery } from '../tree/treeQueries';
import { reviewApi, reviewStateQuery } from './reviewApi';

const TONE = {
  in_review: 'border-info/40 bg-info-soft',
  changes_requested: 'border-warning/50 bg-warning-soft',
  approved: 'border-success/40 bg-success-soft',
  draft: '',
} as const;

/**
 * Where the tree stands with its reviewer (SPEC §5.7): who has it and since when, the notes
 * they sent back, or that it was approved — with the owner's next action beside it.
 */
export function ReviewBanner({ tree }: { tree: TreeDto }) {
  const state = useQuery({ ...reviewStateQuery(tree.id), enabled: tree.status !== 'draft' });
  const [busy, setBusy] = useState<string | null>(null);
  const isOwner = tree.role === 'owner';

  if (tree.status === 'draft' || !state.data) return null;
  const { assignment, changeRequests } = state.data;
  const open = changeRequests.filter((request) => request.status === 'open');
  const reviewer = assignment?.reviewerName ?? assignment?.reviewerEmail ?? 'your reviewer';

  const run = async (key: string, action: () => Promise<unknown>, message: string) => {
    setBusy(key);
    try {
      await action();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: reviewStateQuery(tree.id).queryKey }),
        queryClient.refetchQueries({ queryKey: treeGraphQuery(tree.id).queryKey }),
        queryClient.invalidateQueries({ queryKey: treesQuery.queryKey }),
        queryClient.invalidateQueries({ queryKey: inboxQuery.queryKey }),
      ]);
      announce(message);
      toast({ title: message, tone: 'success' });
    } catch (error) {
      toast({ title: 'That didn’t work', description: describeError(error), tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-label="Review status" className={cx('flex flex-col gap-2 border-b px-4 py-3 sm:px-6', TONE[tree.status])}>
      {tree.status === 'in_review' ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="min-w-0 flex-1 basis-72 text-base">
            <Icon name="clock" className="mr-1.5 inline size-4" />
            With <span className="font-semibold">{reviewer}</span> since {assignment ? relativeTime(assignment.sentAt) : 'recently'}. Editing is paused so they see a stable record.
          </p>
          {isOwner ? (
            <Button pending={busy === 'withdraw'} pendingLabel="Withdrawing…" onClick={() => void run('withdraw', () => reviewApi.withdraw(tree.id), 'Withdrawn from review. You can edit again.')}>
              Withdraw from review
            </Button>
          ) : null}
        </div>
      ) : null}

      {tree.status === 'changes_requested' ? (
        <>
          <p className="text-base font-semibold">
            <Icon name="alert" className="mr-1.5 inline size-4" />
            {reviewer} asked for changes. You can edit the tree again.
          </p>
          <ul className="flex flex-col gap-2">
            {open.map((request) => (
              <li key={request.id} className="flex flex-wrap items-start justify-between gap-3 rounded-control bg-surface px-3 py-2">
                <div className="min-w-0 flex-1 basis-72">
                  <p className="whitespace-pre-line text-base">{request.body}</p>
                  <p className="text-sm text-ink-muted">
                    {request.author ?? 'Your reviewer'} · {relativeTime(request.createdAt)}
                  </p>
                </div>
                {isOwner ? (
                  <Button
                    pending={busy === request.id}
                    pendingLabel="Marking…"
                    onClick={() => void run(request.id, () => reviewApi.resolve(tree.id, request.id), 'Marked as resolved.')}
                    aria-label={`Mark the note from ${request.author ?? 'your reviewer'} resolved`}
                  >
                    Mark resolved
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          {isOwner ? (
            <Button
              variant="primary"
              icon="send"
              className="self-start"
              pending={busy === 'resubmit'}
              pendingLabel="Sending…"
              onClick={() => void run('resubmit', () => reviewApi.resubmit(tree.id), `Sent back to ${reviewer} for review.`)}
            >
              Resubmit for review
            </Button>
          ) : null}
        </>
      ) : null}

      {tree.status === 'approved' ? (
        <p className="text-base">
          <Icon name="check-circle" className="mr-1.5 inline size-4" />
          Approved by <span className="font-semibold">{reviewer}</span>
          {assignment?.decidedAt ? ` ${relativeTime(assignment.decidedAt)}` : ''}. Editing it again returns it to draft, and you can send it for review once more.
        </p>
      ) : null}
    </section>
  );
}
