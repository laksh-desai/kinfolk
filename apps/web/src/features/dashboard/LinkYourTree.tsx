import type { InboxDto } from '@kinfolk/shared/schemas/collaboration';
import type { TreeSummaryDto } from '@kinfolk/shared/schemas/tree';
import { useId, useState } from 'react';
import { Button } from '../../components/Button';
import { inputClasses } from '../../components/fieldStyles';
import { announce } from '../../lib/announcer';
import { describeError } from '../../lib/api';
import { queryClient } from '../../lib/queryClient';
import { toast } from '../../lib/toast';
import { collaborationApi, inboxQuery } from '../collaboration/collaborationApi';

type InvitationItem = InboxDto['invitations'][number];

/** For someone who accepted a relative invitation: pick one of their trees and ask to link it. */
export function LinkYourTree({ invitation, ownTrees, onCreateTree }: { invitation: InvitationItem; ownTrees: TreeSummaryDto[]; onCreateTree: () => void }) {
  const selectId = useId();
  const [chosen, setChosen] = useState<string | null>(null);
  // Trees can finish loading after this renders; fall back to the first until the person picks one.
  const treeId = chosen && ownTrees.some((tree) => tree.id === chosen) ? chosen : (ownTrees[0]?.id ?? '');
  const [pending, setPending] = useState(false);
  const inviter = invitation.invitedBy ?? 'The owner';

  if (invitation.pendingLinkRequest) {
    return <p className="text-sm text-ink-muted">You asked to link your tree. Waiting for {inviter} to approve it.</p>;
  }
  if (ownTrees.length === 0) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-ink-muted">Next: build your own family tree, then link it here.</p>
        <Button icon="plus" onClick={onCreateTree}>
          New family tree
        </Button>
      </div>
    );
  }
  const request = async () => {
    setPending(true);
    try {
      await collaborationApi.requestLink(invitation.id, treeId);
      await queryClient.invalidateQueries({ queryKey: inboxQuery.queryKey });
      const message = `Asked ${inviter} to link your tree to ${invitation.personName}.`;
      announce(message);
      toast({ title: 'Link requested', description: message, tone: 'success' });
    } catch (error) {
      toast({ title: 'Link not requested', description: describeError(error), tone: 'error' });
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label htmlFor={selectId} className="mb-1 block text-sm font-semibold text-ink-muted">
          Your tree to link
        </label>
        <select id={selectId} value={treeId} onChange={(event) => setChosen(event.target.value)} className={inputClasses(false, 'w-auto pr-8')}>
          {ownTrees.map((tree) => (
            <option key={tree.id} value={tree.id}>
              {tree.name}
            </option>
          ))}
        </select>
      </div>
      <Button variant="primary" icon="link" pending={pending} pendingLabel="Asking…" onClick={() => void request()}>
        Ask to link
      </Button>
    </div>
  );
}
