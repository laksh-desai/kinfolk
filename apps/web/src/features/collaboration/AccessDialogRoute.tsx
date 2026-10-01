import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Dialog } from '../../components/Dialog';
import { ErrorState } from '../../components/ErrorState';
import { LoadingRegion } from '../../components/LoadingRegion';
import { Skeleton } from '../../components/Skeleton';
import { useTreeOutlet } from '../tree/treeOutlet';
import { AccessMemberList } from './AccessMemberList';
import { AddAccessForm } from './AddAccessForm';
import { accessQuery } from './collaborationApi';
import { ShareLinksSection } from './ShareLinksSection';

/**
 * Sharing for one tree (SPEC §5.6), addressable at /trees/:treeId/access. The owner invites,
 * changes roles, revokes, and manages share links; everyone else sees who has access.
 */
export function Component() {
  const { tree } = useTreeOutlet();
  const navigate = useNavigate();
  const access = useQuery(accessQuery(tree.id));
  const close = () => navigate(`/trees/${tree.id}`);
  const isOwner = tree.role === 'owner';

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && close()}
      title={isOwner ? `Share “${tree.name}”` : `People with access to “${tree.name}”`}
      description={isOwner ? 'Invite people to view or help edit, or share a read-only link.' : 'Only the owner can change who has access.'}
      size="lg"
    >
      <div className="flex flex-col gap-6">
        {isOwner ? <AddAccessForm treeId={tree.id} /> : null}
        <section aria-labelledby="access-list-heading" className="flex flex-col gap-3">
          <h3 id="access-list-heading" className="text-base font-semibold">
            People with access
          </h3>
          {access.isPending ? (
            <LoadingRegion label="Loading people with access">
              <div className="flex flex-col gap-2">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            </LoadingRegion>
          ) : access.isError ? (
            <ErrorState error={access.error} title="The access list didn’t load" onRetry={() => void access.refetch()} retrying={access.isRefetching} className="py-4" />
          ) : (
            <AccessMemberList treeId={tree.id} list={access.data} />
          )}
        </section>
        {isOwner ? <ShareLinksSection treeId={tree.id} /> : null}
      </div>
    </Dialog>
  );
}
