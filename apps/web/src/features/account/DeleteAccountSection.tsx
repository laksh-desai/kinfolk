import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { buttonClasses } from '../../components/Button';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Icon } from '../../components/Icon';
import { queryClient } from '../../lib/queryClient';
import { toast } from '../../lib/toast';
import { sessionQuery, useCurrentUser } from '../auth/sessionQuery';
import { accountApi } from './accountApi';
import { AccountSection } from './AccountSection';

export function DeleteAccountSection() {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const summary = useQuery({ queryKey: ['account', 'deletion-summary'], queryFn: accountApi.deletionSummary, enabled: open });

  const ownedTrees = summary.data?.ownedTrees ?? [];
  const peopleTotal = ownedTrees.reduce((total, tree) => total + tree.peopleCount, 0);

  return (
    <AccountSection
      title="Export or delete your account"
      description="Download a copy of everything first. Deleting your account can’t be undone."
    >
      <div className="flex flex-wrap gap-3">
        <a href="/api/account/export" download className={buttonClasses('secondary')}>
          <Icon name="download" />
          Download my data
        </a>
        <Button variant="danger-quiet" icon="trash" onClick={() => setOpen(true)}>
          Delete account…
        </Button>
      </div>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete your Kinfolk account?"
        confirmLabel="Delete my account forever"
        pendingLabel="Deleting…"
        typeToConfirm={{ text: user.email, label: `Type your email, ${user.email}, to confirm` }}
        onConfirm={async () => {
          await accountApi.deleteAccount(user.email);
          queryClient.clear();
          queryClient.setQueryData(sessionQuery.queryKey, null);
          toast({ title: 'Your account has been deleted', tone: 'neutral' });
          navigate('/signup', { replace: true });
        }}
      >
        <p>This permanently destroys:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Your profile, photo, and sign-in details ({user.email})</li>
          <li>
            {summary.isPending
              ? 'Every family tree you own'
              : ownedTrees.length === 0
                ? 'No family trees — you don’t own any'
                : `${ownedTrees.length} family ${ownedTrees.length === 1 ? 'tree' : 'trees'} you own, with ${peopleTotal} ${peopleTotal === 1 ? 'person' : 'people'}: ${ownedTrees.map((tree) => tree.name).join(', ')}`}
          </li>
          <li>Everyone else’s access to those trees, share links, and review history</li>
          {summary.data && summary.data.sharedTreeCount > 0 ? (
            <li>Your access to {summary.data.sharedTreeCount} tree(s) other people shared with you (their trees are not deleted)</li>
          ) : null}
        </ul>
        <p>
          Not sure?{' '}
          <a href="/api/account/export" download className="font-semibold text-accent underline underline-offset-4">
            Download your data first
          </a>
          .
        </p>
      </ConfirmDialog>
    </AccountSection>
  );
}
