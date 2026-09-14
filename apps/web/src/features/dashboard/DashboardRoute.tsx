import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingRegion } from '../../components/LoadingRegion';
import { Skeleton } from '../../components/Skeleton';
import { useCurrentUser } from '../auth/sessionQuery';
import { NewTreeDialog } from './NewTreeDialog';
import { TreeCard } from './TreeCard';
import { treesQuery } from './treesApi';

/** The dashboard (SPEC §5.2): every tree the user owns or can open, or a real empty state. */
export function Component() {
  const user = useCurrentUser();
  const [creating, setCreating] = useState(false);
  const trees = useQuery(treesQuery);
  const owned = trees.data?.filter((tree) => tree.role === 'owner') ?? [];
  const shared = trees.data?.filter((tree) => tree.role !== 'owner') ?? [];

  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-screen-xl flex-1 px-4 py-8 outline-none sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Welcome, {user.firstName}</h1>
          <p className="mt-1 text-lg text-ink-muted">Your family trees, and the ones shared with you.</p>
        </div>
        {trees.data && trees.data.length > 0 ? (
          <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
            New family tree
          </Button>
        ) : null}
      </div>

      <div className="mt-8">
        {trees.isPending ? (
          <LoadingRegion label="Loading your family trees">
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((key) => (
                <li key={key} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5">
                  <div className="flex items-center gap-3">
                    <Skeleton className="size-11 rounded-full" />
                    <Skeleton className="h-5 w-40" />
                  </div>
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-6 w-48" />
                </li>
              ))}
            </ul>
          </LoadingRegion>
        ) : trees.isError ? (
          <ErrorState error={trees.error} title="Your family trees didn’t load" onRetry={() => void trees.refetch()} retrying={trees.isRefetching} />
        ) : trees.data.length === 0 ? (
          <EmptyState
            icon="tree"
            title="Start your first family tree"
            className="rounded-card border border-line bg-surface"
            action={
              <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
                New family tree
              </Button>
            }
          >
            A family tree maps the people in a family — parents, partners, children, and in-laws — so you and the professionals you work with
            can see who’s who. Start with one person and grow it in any direction. Trees other people share with you appear here too.
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-10">
            {owned.length > 0 ? (
              <section aria-labelledby="owned-trees-heading">
                <h2 id="owned-trees-heading" className="mb-3 text-xl font-semibold">
                  Your trees
                </h2>
                <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {owned.map((tree) => (
                    <TreeCard key={tree.id} tree={tree} />
                  ))}
                </ul>
              </section>
            ) : null}
            {shared.length > 0 ? (
              <section aria-labelledby="shared-trees-heading">
                <h2 id="shared-trees-heading" className="mb-3 text-xl font-semibold">
                  Shared with you
                </h2>
                <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {shared.map((tree) => (
                    <TreeCard key={tree.id} tree={tree} />
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        )}
      </div>
      <NewTreeDialog open={creating} onOpenChange={setCreating} />
    </main>
  );
}
