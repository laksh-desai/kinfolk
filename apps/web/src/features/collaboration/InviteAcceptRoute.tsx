import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, buttonClasses } from '../../components/Button';
import { FormAlert } from '../../components/FormAlert';
import { LoadingRegion } from '../../components/LoadingRegion';
import { Skeleton } from '../../components/Skeleton';
import { describeError } from '../../lib/api';
import { queryClient } from '../../lib/queryClient';
import { toast } from '../../lib/toast';
import { AuthLayout } from '../auth/AuthLayout';
import { sessionQuery } from '../auth/sessionQuery';
import { collaborationApi, inboxQuery, invitationPreviewQuery } from './collaborationApi';

/**
 * The link in a relative invitation (SPEC §5.5), public at /invite/:token. Shows who invited
 * whom before any sign-in, then signs up or in and comes straight back to accept.
 */
export function Component() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const preview = useQuery(invitationPreviewQuery(token));
  const session = useQuery(sessionQuery);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const returnTo = `/invite/${token}`;

  const accept = async () => {
    setAccepting(true);
    setError(null);
    try {
      await collaborationApi.acceptInvitation(token);
      await queryClient.invalidateQueries({ queryKey: inboxQuery.queryKey });
      toast({ title: 'Invitation accepted', description: 'Build your family tree, then ask to link it from your dashboard.', tone: 'success' });
      navigate('/', { replace: true });
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setAccepting(false);
    }
  };

  if (preview.isPending) {
    return (
      <AuthLayout title="Your invitation">
        <LoadingRegion label="Loading your invitation">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="mt-3 h-11 w-40" />
        </LoadingRegion>
      </AuthLayout>
    );
  }
  if (preview.isError) {
    return (
      <AuthLayout title="This invitation can’t be opened">
        <p className="text-base">{describeError(preview.error)}</p>
      </AuthLayout>
    );
  }

  const { invitedBy, treeName, personName, status } = preview.data;
  const inviter = invitedBy ?? 'Someone';
  if (status !== 'open') {
    const message =
      status === 'accepted'
        ? 'This invitation has already been accepted. If that was you, your dashboard has what’s next.'
        : status === 'expired'
          ? `This invitation has expired. Ask ${inviter} to send it again.`
          : `${inviter} withdrew this invitation.`;
    return (
      <AuthLayout title="This invitation is no longer open">
        <div className="flex flex-col gap-4 text-base">
          <p>{message}</p>
          <Link to="/" className={buttonClasses('primary', 'self-start')}>
            Go to your dashboard
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={`${inviter} invited you to Kinfolk`} intro={`They’re building the family tree “${treeName}” and added you as ${personName}.`}>
      <div className="flex flex-col gap-4 text-base">
        <FormAlert message={error} />
        <p>Accept to build your own side of the family. When it’s ready, you can ask to link it to {personName} in their tree, so both stay connected.</p>
        {session.data ? (
          <>
            <p className="text-ink-muted">
              Signed in as <span className="font-semibold text-ink">{session.data.email}</span>.
            </p>
            <Button variant="primary" icon="check" pending={accepting} pendingLabel="Accepting…" onClick={() => void accept()} className="self-start">
              Accept invitation
            </Button>
          </>
        ) : (
          <div className="flex flex-wrap gap-3">
            <Link to={`/signup?${new URLSearchParams({ returnTo })}`} className={buttonClasses('primary')}>
              Create an account
            </Link>
            <Link to={`/login?${new URLSearchParams({ returnTo })}`} className={buttonClasses('secondary')}>
              Sign in
            </Link>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
