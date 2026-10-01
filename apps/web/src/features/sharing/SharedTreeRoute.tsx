import { directRelatives } from '@kinfolk/shared/relatives/directRelatives';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { EmptyState } from '../../components/EmptyState';
import { Icon } from '../../components/Icon';
import { LoadingRegion } from '../../components/LoadingRegion';
import { Skeleton } from '../../components/Skeleton';
import { StatusBadge } from '../../components/StatusBadge';
import { Wordmark } from '../../components/Brand';
import { ApiError, describeError } from '../../lib/api';
import { cx } from '../../lib/cx';
import { TreeCanvas } from '../../canvas/TreeCanvas';
import { useCollapsed } from '../../canvas/useCanvasStore';
import { sharedTreeQuery } from '../collaboration/collaborationApi';
import { TreeSearch } from '../tree/header/TreeSearch';
import { TreeOutline } from '../tree/list/TreeOutline';
import { useTreeView } from '../tree/useTreeView';
import { SharedPersonPanel } from './SharedPersonPanel';
import { toViewGraph } from './toViewGraph';

/**
 * A tree opened from a share link (SPEC §5.6), public at /s/:token. Read-only, redacted by the
 * API, with the same canvas and list as the app. Selection and view live in the URL.
 */
export function Component() {
  const { token = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const shared = useQuery(sharedTreeQuery(token));
  const graph = useMemo(() => (shared.data ? toViewGraph(shared.data.graph) : { people: [], unions: [], parentChildren: [], focusPersonId: null }), [shared.data]);
  const viewKey = `shared:${token.slice(0, 24)}`;
  const collapsed = useCollapsed(viewKey);
  const view = useTreeView(graph, collapsed);
  const selectedId = params.get('person');
  const listView = params.get('view') === 'list';
  const base = `/s/${token}`;
  const hrefFor = useCallback(
    (personId: string | null, list = listView) => {
      const next = new URLSearchParams();
      if (personId) next.set('person', personId);
      if (list) next.set('view', 'list');
      const query = next.toString();
      return query ? `${base}?${query}` : base;
    },
    [base, listView],
  );
  const onSelect = useCallback((personId: string | null) => navigate(hrefFor(personId), { replace: true }), [navigate, hrefFor]);
  const selected = selectedId ? graph.people.find((person) => person.id === selectedId) : undefined;
  const relatives = useMemo(() => {
    if (!selected) return [];
    const direct = directRelatives(view.index, view.resolve, selected.id);
    const entries = [...direct.parentFamilies.flatMap((family) => family.parents), ...direct.partners, ...direct.siblings, ...direct.childFamilies.flatMap((family) => family.children)];
    return entries
      .filter((entry, position) => entries.findIndex((other) => other.personId === entry.personId) === position)
      .map((entry) => ({ id: entry.personId, label: entry.label, name: view.names.get(entry.personId) ?? 'Unnamed person', href: hrefFor(entry.personId) }));
  }, [selected, view, hrefFor]);

  if (shared.isPending) {
    return (
      <div className="flex min-h-screen flex-col bg-ground">
        <header className="border-b border-line bg-surface px-4 py-2 sm:px-6">
          <Wordmark />
        </header>
        <main id="main" tabIndex={-1} className="p-6">
          <LoadingRegion label="Opening the shared family tree">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="mt-4 h-96 w-full" />
          </LoadingRegion>
        </main>
      </div>
    );
  }

  if (shared.isError) {
    const gone = shared.error instanceof ApiError && shared.error.status === 410;
    return (
      <div className="flex min-h-screen flex-col bg-ground">
        <header className="border-b border-line bg-surface px-4 py-2 sm:px-6">
          <Wordmark />
        </header>
        <main id="main" tabIndex={-1} className="flex flex-1 items-start justify-center px-4 py-10">
          <EmptyState icon={gone ? 'clock' : 'unlink'} title={gone ? 'This share link no longer works' : 'This share link can’t be opened'} className="rounded-card border border-line bg-surface">
            {describeError(shared.error)}
          </EmptyState>
        </main>
      </div>
    );
  }

  const { tree } = shared.data;
  return (
    <div className="flex h-screen min-h-0 flex-col bg-ground">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-4 py-2 sm:px-6">
        <Wordmark />
        <h1 className="min-w-0 truncate font-serif text-2xl font-semibold">{tree.name}</h1>
        <StatusBadge status={tree.status} />
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-sm font-semibold text-ink-muted">
          <Icon name="eye" className="size-4" />
          Shared view · read-only
        </span>
        {graph.people.length > 0 ? (
          <nav aria-label="Tree view" className="ml-auto inline-flex overflow-hidden rounded-control border border-line-strong">
            {[
              { list: false, label: 'Tree', icon: 'tree' as const },
              { list: true, label: 'List', icon: 'list' as const },
            ].map((option) => (
              <Link
                key={option.label}
                to={hrefFor(selectedId, option.list)}
                replace
                aria-current={listView === option.list ? 'page' : undefined}
                className={cx('inline-flex min-h-11 items-center gap-2 px-3 text-base font-semibold', listView === option.list ? 'bg-accent text-on-accent' : 'bg-surface text-ink hover:bg-sunken')}
              >
                <Icon name={option.icon} />
                {option.label}
              </Link>
            ))}
          </nav>
        ) : null}
      </header>
      <main id="main" tabIndex={-1} className="flex min-h-0 flex-1 outline-none">
        <div className="relative min-h-0 min-w-0 flex-1">
          {graph.people.length > 0 ? <TreeSearch view={view} onChoose={onSelect} showTrigger={listView} /> : null}
          {graph.people.length === 0 ? (
            <EmptyState icon="tree" title="No one in this family tree yet" className="py-16">
              The owner hasn’t added anyone yet. People will appear here once they do.
            </EmptyState>
          ) : listView ? (
            <TreeOutline view={view} selectedId={selectedId} personHref={(personId) => hrefFor(personId, true)} editTreeId={null} />
          ) : (
            <TreeCanvas treeId={viewKey} view={view} selectedId={selectedId} onSelect={onSelect} />
          )}
        </div>
        {selected ? (
          <SharedPersonPanel
            person={selected}
            name={view.names.get(selected.id) ?? ''}
            relation={view.relationToFocus.get(selected.id)?.label ?? null}
            closeTo={hrefFor(null)}
            relatives={relatives}
          />
        ) : null}
      </main>
    </div>
  );
}
