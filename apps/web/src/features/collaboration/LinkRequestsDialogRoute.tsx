import type { LinkRequestDto } from '@kinfolk/shared/schemas/collaboration';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Skeleton } from '../../components/Skeleton';
import { announce } from '../../lib/announcer';
import { describeError } from '../../lib/api';
import { queryClient } from '../../lib/queryClient';
import { relativeTime } from '../../lib/relativeTime';
import { toast } from '../../lib/toast';
import { treeGraphQuery } from '../tree/treeQueries';
import { useTreeOutlet } from '../tree/treeOutlet';
import { collaborationApi, inboxQuery, invitationsQuery, linkRequestsQuery } from './collaborationApi';

const STATUS_WORD = { pending: 'Waiting for you', approved: 'Approved', rejected: 'Declined' } as const;

/**
 * Link requests (SPEC §5.5), addressable at /trees/:treeId/link-requests. A relative who built
 * their own tree asks to connect it to their person here; the owner approves or declines.
 */
export function Component() {
  const { tree } = useTreeOutlet();
  const navigate = useNavigate();
  const requests = useQuery({ ...linkRequestsQuery(tree.id), enabled: tree.role === 'owner' });
  const [busy, setBusy] = useState<string | null>(null);
  const close = () => navigate(`/trees/${tree.id}`);

  const answer = async (request: LinkRequestDto, decision: 'approve' | 'reject') => {
    setBusy(`${request.id}:${decision}`);
    try {
      await collaborationApi.answerLinkRequest(tree.id, request.id, decision);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: linkRequestsQuery(tree.id).queryKey }),
        queryClient.invalidateQueries({ queryKey: inboxQuery.queryKey }),
        queryClient.invalidateQueries({ queryKey: invitationsQuery(tree.id).queryKey }),
        decision === 'approve' ? queryClient.refetchQueries({ queryKey: treeGraphQuery(tree.id).queryKey }) : Promise.resolve(),
      ]);
      const message = decision === 'approve' ? `Linked ${request.fromTree.name} to ${request.person.name}.` : `Declined the request from ${request.requestedBy ?? 'them'}.`;
      announce(message);
      toast({ title: message, tone: decision === 'approve' ? 'success' : 'neutral' });
    } catch (error) {
      toast({ title: 'That didn’t work', description: describeError(error), tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && close()}
      title="Link requests"
      description="When you invite a relative and they build their own family tree, they can ask to link it to their person in yours. Approving connects the two trees so you can open theirs from their card."
      size="md"
    >
      {tree.role !== 'owner' ? (
        <p className="text-base">Only the owner of “{tree.name}” reviews link requests.</p>
      ) : requests.isPending ? (
        <div role="status" aria-busy="true" className="flex flex-col gap-2">
          <span className="sr-only">Loading link requests</span>
          <Skeleton className="h-16 w-full" />
        </div>
      ) : requests.isError ? (
        <ErrorState error={requests.error} title="Link requests didn’t load" onRetry={() => void requests.refetch()} retrying={requests.isRefetching} className="py-4" />
      ) : requests.data.length === 0 ? (
        <EmptyState icon="link" title="No link requests" headingLevel={3} className="py-6">
          Invite a relative from their card. Once they’ve built their own tree, their request to link it shows up here.
        </EmptyState>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-card border border-line">
          {requests.data.map((request) => (
            <li key={request.id} className="flex flex-col gap-2 px-4 py-3">
              <p className="text-base">
                <span className="font-semibold">{request.requestedBy ?? 'Someone'}</span> wants to link <span className="font-semibold">{request.fromTree.name}</span> to{' '}
                <span className="font-semibold">{request.person.name}</span>.
              </p>
              <p className="text-sm text-ink-muted">
                {STATUS_WORD[request.status]} · asked {relativeTime(request.createdAt)}
              </p>
              {request.status === 'pending' ? (
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" icon="check" pending={busy === `${request.id}:approve`} pendingLabel="Approving…" onClick={() => void answer(request, 'approve')}>
                    Approve
                  </Button>
                  <Button pending={busy === `${request.id}:reject`} pendingLabel="Declining…" onClick={() => void answer(request, 'reject')}>
                    Decline
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
