import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, buttonClasses } from '../../components/Button';
import { ErrorState } from '../../components/ErrorState';
import { announce } from '../../lib/announcer';
import { describeError } from '../../lib/api';
import { queryClient } from '../../lib/queryClient';
import { toast } from '../../lib/toast';
import { collaborationApi, inboxQuery } from '../collaboration/collaborationApi';
import { LinkYourTree } from './LinkYourTree';
import { treesQuery } from './treesApi';

/**
 * Everything waiting on this person (SPEC §5.2): access invitations to accept, link requests to
 * review, and their own invitations to finish. Absent when there's nothing to do.
 */
export function Inbox({ onCreateTree }: { onCreateTree: () => void }) {
  const inbox = useQuery(inboxQuery);
  const trees = useQuery(treesQuery);
  const [answering, setAnswering] = useState<string | null>(null);

  if (inbox.isPending) return null;
  if (inbox.isError) {
    return <ErrorState error={inbox.error} title="Invitations and requests didn’t load" onRetry={() => void inbox.refetch()} retrying={inbox.isRefetching} className="py-4" />;
  }
  const { accessInvites, linkRequests, invitations } = inbox.data;
  if (accessInvites.length + linkRequests.length + invitations.length === 0) return null;
  const ownTrees = trees.data?.filter((tree) => tree.role === 'owner') ?? [];

  const answerAccess = async (id: string, treeName: string, decision: 'accept' | 'decline') => {
    setAnswering(`${id}:${decision}`);
    try {
      await collaborationApi.answerAccessInvite(id, decision);
      await Promise.all([queryClient.invalidateQueries({ queryKey: inboxQuery.queryKey }), queryClient.invalidateQueries({ queryKey: treesQuery.queryKey })]);
      const message = decision === 'accept' ? `“${treeName}” is now in your family trees.` : `Declined the invitation to “${treeName}”.`;
      announce(message);
      toast({ title: message, tone: decision === 'accept' ? 'success' : 'neutral' });
    } catch (error) {
      toast({ title: 'That didn’t work', description: describeError(error), tone: 'error' });
    } finally {
      setAnswering(null);
    }
  };

  return (
    <section aria-labelledby="inbox-heading" className="rounded-card border border-accent/40 bg-surface p-5 shadow-card">
      <h2 id="inbox-heading" className="mb-3 text-xl font-semibold">
        Waiting for you
      </h2>
      <ul className="flex flex-col divide-y divide-line">
        {accessInvites.map((invite) => (
          <li key={invite.id} className="flex flex-col gap-2 py-3">
            <p className="text-base">
              <span className="font-semibold">{invite.invitedBy ?? 'Someone'}</span> invited you to {invite.role === 'editor' ? 'help edit' : 'view'}{' '}
              <span className="font-semibold">“{invite.tree.name}”</span>.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" icon="check" pending={answering === `${invite.id}:accept`} pendingLabel="Accepting…" onClick={() => void answerAccess(invite.id, invite.tree.name, 'accept')}>
                Accept
              </Button>
              <Button pending={answering === `${invite.id}:decline`} pendingLabel="Declining…" onClick={() => void answerAccess(invite.id, invite.tree.name, 'decline')}>
                Decline
              </Button>
            </div>
          </li>
        ))}
        {linkRequests.map((request) => (
          <li key={request.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <p className="min-w-0 flex-1 basis-64 text-base">
              <span className="font-semibold">{request.requestedBy ?? 'A relative'}</span> wants to link their tree <span className="font-semibold">“{request.fromTree.name}”</span> to{' '}
              {request.person.name} in “{request.toTree.name}”.
            </p>
            <Link to={`/trees/${request.toTree.id}/link-requests`} className={buttonClasses('secondary')}>
              Review
            </Link>
          </li>
        ))}
        {invitations.map((invitation) => (
          <li key={invitation.id} className="flex flex-col gap-2 py-3">
            <p className="text-base">
              <span className="font-semibold">{invitation.invitedBy ?? 'Someone'}</span> added you as {invitation.personName} in{' '}
              <span className="font-semibold">“{invitation.tree.name}”</span>. Link your own tree to theirs so both stay connected.
            </p>
            <LinkYourTree invitation={invitation} ownTrees={ownTrees} onCreateTree={onCreateTree} />
          </li>
        ))}
      </ul>
    </section>
  );
}
