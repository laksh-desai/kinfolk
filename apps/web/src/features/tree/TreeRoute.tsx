import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { Outlet, useLoaderData, useMatch, useNavigate, type LoaderFunctionArgs } from 'react-router-dom';
import { EmptyState } from '../../components/EmptyState';
import { Icon } from '../../components/Icon';
import { StatusBadge } from '../../components/StatusBadge';
import { queryClient } from '../../lib/queryClient';
import { TreeCanvas } from '../../canvas/TreeCanvas';
import { useCollapsed } from '../../canvas/useCanvasStore';
import { treeGraphQuery, type TreeGraphResponse } from './treeQueries';
import { useTreeView } from './useTreeView';

export async function loader({ params }: LoaderFunctionArgs) {
  return queryClient.ensureQueryData(treeGraphQuery(params.treeId ?? ''));
}

const ROLE_LABEL = { owner: null, editor: 'You can edit', viewer: 'View only', reviewer: 'Reviewing' } as const;

export function Component() {
  const initial = useLoaderData() as TreeGraphResponse;
  const treeId = initial.tree.id;
  const { data } = useQuery({ ...treeGraphQuery(treeId), initialData: initial });
  const collapsed = useCollapsed(treeId);
  const view = useTreeView(data.graph, collapsed);
  const navigate = useNavigate();
  const personMatch = useMatch('/trees/:treeId/people/:personId/*');
  const selectedId = personMatch?.params.personId ?? null;
  const { tree } = data;

  const onSelect = useCallback(
    (personId: string | null, options?: { openPanel?: boolean }) => {
      if (!personId) {
        navigate(`/trees/${treeId}`, { replace: true });
        return;
      }
      navigate(`/trees/${treeId}/people/${personId}`, { replace: true, state: options?.openPanel ? { focusPanel: true } : undefined });
    },
    [navigate, treeId],
  );

  const roleLabel = ROLE_LABEL[tree.role];

  return (
    <main id="main" tabIndex={-1} className="flex min-h-0 flex-1 flex-col outline-none">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-4 py-3 sm:px-6">
        <h1 className="min-w-0 truncate font-serif text-2xl font-semibold">{tree.name}</h1>
        <StatusBadge status={tree.status} />
        {roleLabel ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-sm font-semibold text-ink-muted">
            <Icon name={tree.role === 'viewer' ? 'eye' : 'users'} className="size-4" />
            {roleLabel}
          </span>
        ) : null}
        <span className="text-base text-ink-muted">
          {data.graph.people.length} {data.graph.people.length === 1 ? 'person' : 'people'}
        </span>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="relative min-h-[28rem] min-w-0 flex-1" style={{ height: 'calc(100vh - 8.5rem)' }}>
          {data.graph.people.length === 0 ? (
            <EmptyState icon="tree" title="No one in this family tree yet" className="py-16">
              Start with one person — usually yourself or the person whose planning this is for. From them you can add parents, partners,
              children, and siblings, and grow the tree in any direction.
            </EmptyState>
          ) : (
            <TreeCanvas treeId={treeId} view={view} selectedId={selectedId} onSelect={onSelect} />
          )}
        </div>
        <Outlet context={{ view, tree, onSelect }} />
      </div>
    </main>
  );
}
