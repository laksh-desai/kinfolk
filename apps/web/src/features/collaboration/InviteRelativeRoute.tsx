import { createInvitationSchema, type InvitationDto } from '@kinfolk/shared/schemas/collaboration';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { z } from 'zod';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ErrorState } from '../../components/ErrorState';
import { FormAlert } from '../../components/FormAlert';
import { Skeleton } from '../../components/Skeleton';
import { TextField } from '../../components/TextField';
import { announce } from '../../lib/announcer';
import { describeError } from '../../lib/api';
import { queryClient } from '../../lib/queryClient';
import { toast } from '../../lib/toast';
import { useForm } from '../../lib/useForm';
import { PanelShell } from '../tree/people/PanelShell';
import { PersonNotFound } from '../tree/people/PersonNotFound';
import { ReadOnlyPanel } from '../tree/people/ReadOnlyPanel';
import { useTreeOutlet } from '../tree/treeOutlet';
import { collaborationApi, invitationsQuery } from './collaborationApi';
import { InvitationTracker } from './InvitationTracker';

const emailOnly = z.object({ email: createInvitationSchema.shape.email });

/**
 * Invite a relative to build their own tree (SPEC §5.5), from their card. Addressable at
 * /trees/:treeId/people/:personId/invite. Shows the real four-stage progress once sent.
 */
export function Component() {
  const { personId = '' } = useParams();
  const { view, tree } = useTreeOutlet();
  const person = view.graph.people.find((candidate) => candidate.id === personId);
  const canInvite = tree.role === 'owner' || tree.role === 'editor';
  const invitations = useQuery({ ...invitationsQuery(tree.id), enabled: canInvite });
  const [busy, setBusy] = useState<'resend' | null>(null);
  const [withdrawing, setWithdrawing] = useState<InvitationDto | null>(null);
  const name = view.names.get(personId) ?? '';

  const form = useForm({
    schema: emailOnly,
    initialValues: { email: person?.email ?? '' },
    labels: { email: 'Their email' },
    idPrefix: 'invite-relative',
    onSubmit: async ({ email }) => {
      await collaborationApi.invite(tree.id, personId, email);
      await queryClient.invalidateQueries({ queryKey: invitationsQuery(tree.id).queryKey });
      announce(`Invitation sent to ${email}.`);
      toast({ title: `Invited ${name}`, description: `We emailed ${email} a link to join.`, tone: 'success' });
    },
  });

  if (!person) return <PersonNotFound treeId={tree.id} />;
  if (!canInvite) return <ReadOnlyPanel tree={tree} personId={person.id} />;

  const current = invitations.data?.find((invitation) => invitation.personId === person.id && !invitation.revokedAt) ?? null;

  const resend = async (invitation: InvitationDto) => {
    setBusy('resend');
    try {
      await collaborationApi.resendInvitation(tree.id, invitation.id);
      await queryClient.invalidateQueries({ queryKey: invitationsQuery(tree.id).queryKey });
      toast({ title: 'Invitation sent again', description: `We emailed ${invitation.email} a fresh link. The old one no longer works.`, tone: 'success' });
    } catch (error) {
      toast({ title: 'Invitation not resent', description: describeError(error), tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <PanelShell
      title={`Invite ${name}`}
      subtitle="They build their own side of the family, then link it to this tree."
      back={{ to: `/trees/${tree.id}/people/${person.id}`, label: `Back to ${name}` }}
      closeTo={`/trees/${tree.id}/people/${person.id}`}
      closeLabel={`Close and return to ${name}`}
    >
      <div className="flex flex-col gap-5 px-5 py-4 text-base">
        {invitations.isPending ? (
          <div role="status" aria-busy="true">
            <span className="sr-only">Loading invitation</span>
            <Skeleton className="h-40 w-full" />
          </div>
        ) : invitations.isError ? (
          <ErrorState error={invitations.error} title="The invitation didn’t load" onRetry={() => void invitations.refetch()} retrying={invitations.isRefetching} className="py-4" />
        ) : current ? (
          <>
            <p>
              Invited at <span className="font-semibold break-all">{current.email}</span>.
            </p>
            <InvitationTracker invitation={current} />
            {current.stage !== 'linked' ? (
              <div className="flex flex-wrap gap-2">
                {current.stage === 'sent' ? (
                  <Button icon="send" pending={busy === 'resend'} pendingLabel="Sending…" onClick={() => void resend(current)}>
                    Resend invitation
                  </Button>
                ) : null}
                <Button variant="danger-quiet" onClick={() => setWithdrawing(current)}>
                  Withdraw invitation
                </Button>
              </div>
            ) : (
              <p className="text-ink-muted">{name}’s own tree is linked. Open it from their details.</p>
            )}
          </>
        ) : (
          <form noValidate onSubmit={form.handleSubmit} className="flex flex-col gap-4">
            <FormAlert message={form.formError} alertRef={form.formErrorRef} />
            <p>
              We’ll email {name} a link. They create a free account, build their own family tree, and can ask to link it to their place in “{tree.name}”.
              Joining doesn’t give them access to this tree.
            </p>
            <TextField field={form.field('email')} label="Their email" type="email" required autoComplete="off" />
            <Button type="submit" variant="primary" icon="send" pending={form.submitting} pendingLabel="Sending…" className="self-start">
              Send invitation
            </Button>
          </form>
        )}
      </div>
      <ConfirmDialog
        open={withdrawing !== null}
        onOpenChange={(open) => !open && setWithdrawing(null)}
        title="Withdraw this invitation?"
        confirmLabel="Withdraw"
        pendingLabel="Withdrawing…"
        onConfirm={async () => {
          if (!withdrawing) return;
          await collaborationApi.withdrawInvitation(tree.id, withdrawing.id);
          await queryClient.invalidateQueries({ queryKey: invitationsQuery(tree.id).queryKey });
          toast({ title: 'Invitation withdrawn', tone: 'neutral' });
        }}
      >
        <p>The link in their email will stop working. You can invite them again later.</p>
      </ConfirmDialog>
    </PanelShell>
  );
}
