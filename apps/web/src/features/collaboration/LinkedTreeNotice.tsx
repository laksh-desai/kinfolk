import type { TreeDto } from '@kinfolk/shared/schemas/tree';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { buttonClasses } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { Skeleton } from '../../components/Skeleton';
import { api, ApiError } from '../../lib/api';

export const treeDetailsQuery = (treeId: string) =>
  queryOptions({
    queryKey: ['tree', treeId, 'details'] as const,
    queryFn: async () => (await api<{ tree: TreeDto }>(`/api/trees/${treeId}`)).tree,
    retry: false,
    staleTime: 60_000,
  });

interface LinkedTreeNoticeProps {
  fromTreeId: string;
  personId: string;
  personName: string;
  linkedTreeId: string;
}

/**
 * A person whose own tree is linked (SPEC §5.5). When the caller can open it, a link with a way
 * back; when they can't, a plain explanation instead of a disabled control (SPEC §6.15).
 */
export function LinkedTreeNotice({ fromTreeId, personId, personName, linkedTreeId }: LinkedTreeNoticeProps) {
  const linked = useQuery(treeDetailsQuery(linkedTreeId));
  return (
    <section aria-labelledby="linked-tree-heading" className="mx-5 mb-4 flex flex-col gap-2 rounded-card border border-line bg-sunken/60 px-4 py-3">
      <h3 id="linked-tree-heading" className="flex items-center gap-2 text-base font-semibold">
        <Icon name="link" className="size-4" />
        Linked family tree
      </h3>
      {linked.isPending ? (
        <div role="status" aria-busy="true">
          <span className="sr-only">Checking the linked tree</span>
          <Skeleton className="h-10 w-48" />
        </div>
      ) : linked.isSuccess ? (
        <>
          <p className="text-base">
            {personName} built their own family tree, “{linked.data.name}”, and linked it here.
          </p>
          <Link
            to={`/trees/${linkedTreeId}?${new URLSearchParams({ from: fromTreeId, person: personId })}`}
            className={buttonClasses('secondary', 'self-start')}
          >
            <Icon name="external" />
            Open {linked.data.name}
          </Link>
        </>
      ) : linked.error instanceof ApiError && linked.error.status === 404 ? (
        <p className="text-base">
          {personName} built their own family tree and linked it here, but it isn’t shared with you. Ask {personName} to give you access to open it.
        </p>
      ) : (
        <p className="text-base">
          We couldn’t check the linked tree right now.{' '}
          <button type="button" className="font-semibold text-accent underline" onClick={() => void linked.refetch()}>
            Try again
          </button>
        </p>
      )}
    </section>
  );
}
