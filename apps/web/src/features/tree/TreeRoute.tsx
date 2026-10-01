import { useQuery } from '@tanstack/react-query';
import { planSetFocus } from '@kinfolk/shared/relatives/planRelationshipEdits';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useLoaderData, useMatch, useNavigate, useSearchParams, type LoaderFunctionArgs } from 'react-router-dom';
import { buttonClasses } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { Icon } from '../../components/Icon';
import { StatusBadge } from '../../components/StatusBadge';
import { getTreeViewPreference, setTreeViewPreference, type TreeViewPreference } from '../../lib/preferences';
import { queryClient } from '../../lib/queryClient';
import type { CardMenuItem } from '../../canvas/CardMenu';
import { TreeCanvas } from '../../canvas/TreeCanvas';
import { useCanvasStore, useCollapsed } from '../../canvas/useCanvasStore';
import { LinkedTreeBreadcrumb } from '../collaboration/LinkedTreeBreadcrumb';
import { ExportMenu } from '../export/ExportMenu';
import { ReviewBanner } from '../review/ReviewBanner';
import { commitWithUndo } from './editing/changeQueue';
import { SaveIndicator } from './editing/SaveIndicator';
import { UndoRedoButtons } from './editing/UndoRedoButtons';
import { DeleteTreeDialog } from './header/DeleteTreeDialog';
import { TreeSettingsMenu } from './header/TreeSettingsMenu';
import { TreeTitle } from './header/TreeTitle';
import { ViewSwitch } from './header/ViewSwitch';
import { TreeOutline } from './list/TreeOutline';
import { PRIMITIVES } from './people/PersonActions';
import { usePersonDialogs } from './people/personDialogStore';
import { canEditTree } from './treePermissions';
import { treeGraphQuery, type TreeGraphResponse } from './treeQueries';
import { useTreeView } from './useTreeView';

export async function loader({ params }: LoaderFunctionArgs) {
  return queryClient.ensureQueryData(treeGraphQuery(params.treeId ?? ''));
}

const ROLE_LABEL = { owner: null, editor: 'You can edit', viewer: 'View only', reviewer: 'Reviewing' } as const;

// Deleting a person needs the impact planner and the dialog; neither belongs in the tree page's
// first load (SPEC §9 budget), and the dialog is only ever mounted while open.
const DeletePersonDialog = lazy(() => import('./people/DeletePersonDialog').then((module) => ({ default: module.DeletePersonDialog })));

export function Component() {
  const initial = useLoaderData() as TreeGraphResponse;
  const treeId = initial.tree.id;
  const { data } = useQuery({ ...treeGraphQuery(treeId), initialData: initial });
  const collapsed = useCollapsed(treeId);
  const toggleCollapsed = useCanvasStore((state) => state.toggleCollapsed);
  const view = useTreeView(data.graph, collapsed);
  const navigate = useNavigate();
  const personMatch = useMatch('/trees/:treeId/people/:personId/*');
  const compareMatch = useMatch('/trees/:treeId/compare');
  const [searchParams] = useSearchParams();
  const selectedId = personMatch?.params.personId ?? null;
  const { tree } = data;
  const editable = canEditTree(tree);
  const deletingId = usePersonDialogs((state) => state.deletingId);
  const openDelete = usePersonDialogs((state) => state.openDelete);
  const closeDelete = usePersonDialogs((state) => state.close);
  const [renaming, setRenaming] = useState(false);
  const [deletingTree, setDeletingTree] = useState(false);
  // The view named in the URL wins and is remembered; otherwise the remembered choice applies.
  const viewParam = searchParams.get('view');
  const requestedView: TreeViewPreference | null = viewParam === 'list' || viewParam === 'canvas' ? viewParam : null;
  const [savedView, setSavedView] = useState(getTreeViewPreference);
  const viewMode = requestedView ?? savedView;
  useEffect(() => {
    if (!requestedView) return;
    setTreeViewPreference(requestedView);
    // Later screens (a person's panel, say) drop the query string; keep the chosen view for them.
    setSavedView(requestedView);
  }, [requestedView]);

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

  const fromTreeId = searchParams.get('from');

  const personHref = useCallback((personId: string) => `/trees/${treeId}/people/${personId}`, [treeId]);

  const compareA = compareMatch ? searchParams.get('a') : null;
  const compareB = compareMatch ? searchParams.get('b') : null;
  const highlightPath = useMemo(() => {
    if (!compareA || !compareB || compareA === compareB || !view.index.person(compareA) || !view.index.person(compareB)) return null;
    return view.resolve(compareA, compareB).path;
  }, [compareA, compareB, view]);

  const cardMenuItems = useCallback(
    (personId: string): CardMenuItem[] => {
      const name = view.names.get(personId) ?? 'this person';
      const base = `/trees/${treeId}/people/${personId}`;
      const focusId = view.graph.focusPersonId;
      const node = view.layout.nodes.find((candidate) => candidate.personId === personId);
      const isCollapsed = collapsed.includes(personId);
      const items: CardMenuItem[] = [{ label: 'Open details', icon: 'user', movesFocus: true, onSelect: () => navigate(base, { state: { focusPanel: true } }) }];
      if (editable) {
        items.push({ separator: true, key: 'add' });
        for (const primitive of PRIMITIVES) {
          items.push({ label: primitive.label, icon: 'user-plus', movesFocus: true, onSelect: () => navigate(`${base}/add/${primitive.relation}`) });
        }
        items.push({ label: 'More relatives…', icon: 'users', movesFocus: true, onSelect: () => navigate(`${base}/add`) });
        items.push({ separator: true, key: 'edit' });
        items.push({ label: 'Edit details', icon: 'pencil', movesFocus: true, onSelect: () => navigate(`${base}/edit`) });
        items.push({ label: 'Relationships', icon: 'link', movesFocus: true, onSelect: () => navigate(`${base}/relationships`) });
        if (focusId !== personId) {
          items.push({
            label: 'Set as focus',
            icon: 'target',
            onSelect: () => void commitWithUndo(treeId, planSetFocus(personId), `Made ${name} the focus person`, `Relationships are now shown relative to ${name}.`).catch(() => undefined),
          });
        }
      }
      items.push({ separator: true, key: 'view' });
      items.push({
        label: 'Compare…',
        icon: 'compare',
        movesFocus: true,
        onSelect: () => navigate(`/trees/${treeId}/compare?a=${personId}${focusId && focusId !== personId ? `&b=${focusId}` : ''}`),
      });
      if (node?.hasDescendants || isCollapsed) {
        items.push({ label: isCollapsed ? 'Show descendants' : 'Hide descendants', icon: isCollapsed ? 'expand' : 'collapse', onSelect: () => toggleCollapsed(treeId, personId) });
      }
      if (editable) {
        items.push({ label: 'Merge with…', icon: 'merge', movesFocus: true, onSelect: () => navigate(`${base}/merge`) });
        items.push({ label: 'Delete…', icon: 'trash', tone: 'danger', movesFocus: true, onSelect: () => openDelete(personId) });
      }
      return items;
    },
    [view, treeId, collapsed, editable, navigate, toggleCollapsed, openDelete],
  );

  const roleLabel = ROLE_LABEL[tree.role];
  const needsDetail = data.graph.people.filter((person) => person.isPlaceholder || !person.birthDate).length;
  const count = data.graph.people.length;

  return (
    // Exactly the viewport below the shell's 4rem header, so the canvas gets whatever the tree
    // header, the breadcrumb, and the review banner leave — however many rows they wrap to.
    <main id="main" tabIndex={-1} className="flex h-[calc(100dvh-4rem)] min-h-0 flex-col outline-none">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-4 py-2 sm:px-6">
        <TreeTitle tree={tree} editing={renaming} onEditingChange={setRenaming} />
        {tree.role === 'owner' && !renaming ? (
          <TreeSettingsMenu
            treeName={tree.name}
            onRename={() => setRenaming(true)}
            onDelete={() => setDeletingTree(true)}
            onLinkRequests={() => navigate(`/trees/${treeId}/link-requests`)}
          />
        ) : null}
        <StatusBadge status={tree.status} />
        {roleLabel ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-sm font-semibold text-ink-muted">
            <Icon name={tree.role === 'viewer' ? 'eye' : 'users'} className="size-4" />
            {roleLabel}
          </span>
        ) : null}
        <span className="text-base text-ink-muted">
          {count} {count === 1 ? 'person' : 'people'}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {count > 0 ? <ViewSwitch view={viewMode} /> : null}
          {editable ? <SaveIndicator treeId={treeId} /> : null}
          {editable ? <UndoRedoButtons treeId={treeId} /> : null}
          {count > 0 ? (
            <>
              <Link to={`/trees/${treeId}/needs-detail`} className={buttonClasses('ghost', 'px-3')}>
                <Icon name="list" />
                Needs detail{needsDetail > 0 ? ` (${needsDetail})` : ''}
              </Link>
              <Link to={`/trees/${treeId}/compare${selectedId ? `?a=${selectedId}` : ''}`} className={buttonClasses('ghost', 'px-3')}>
                <Icon name="compare" />
                Compare
              </Link>
            </>
          ) : null}
          {tree.role === 'owner' && (tree.status === 'draft' || tree.status === 'approved') && count > 0 ? (
            <Link to={`/trees/${treeId}/review`} className={buttonClasses('secondary', 'px-3')}>
              <Icon name="shield" />
              Send for review
            </Link>
          ) : null}
          <Link to={`/trees/${treeId}/access`} className={buttonClasses('secondary', 'px-3')}>
            <Icon name="share" />
            {tree.role === 'owner' ? 'Share' : 'People with access'}
          </Link>
          {count > 0 ? <ExportMenu input={{ graph: view.graph, layout: view.layout, treeName: tree.name, relationOf: (personId) => view.relationToFocus.get(personId)?.label ?? null }} /> : null}
          {editable ? (
            <Link to={`/trees/${treeId}/import`} className={buttonClasses('secondary', 'px-3')}>
              <Icon name="import" />
              Import
            </Link>
          ) : null}
          {editable && count > 0 ? (
            <Link to={`/trees/${treeId}/add`} className={buttonClasses('secondary', 'px-3')}>
              <Icon name="user-plus" />
              Add person
            </Link>
          ) : null}
        </div>
      </div>
      {fromTreeId ? <LinkedTreeBreadcrumb fromTreeId={fromTreeId} personId={searchParams.get('person')} /> : null}
      <ReviewBanner tree={tree} />
      <div className="flex min-h-0 flex-1">
        <div className="relative min-h-0 min-w-0 flex-1">
          {count === 0 ? (
            <EmptyState
              icon="tree"
              title="No one in this family tree yet"
              className="py-16"
              action={
                editable ? (
                  <>
                    <Link to={`/trees/${treeId}/add`} className={buttonClasses('primary')}>
                      <Icon name="user-plus" />
                      Add the first person
                    </Link>
                    <Link to={`/trees/${treeId}/import`} className={buttonClasses('secondary')}>
                      <Icon name="import" />
                      Import from a file
                    </Link>
                  </>
                ) : null
              }
            >
              {editable
                ? 'Start with one person — usually yourself. From them you can add parents, partners, children, and siblings, and grow the tree in any direction.'
                : 'The owner hasn’t added anyone yet. People will appear here as soon as they do.'}
            </EmptyState>
          ) : viewMode === 'list' ? (
            <TreeOutline view={view} selectedId={selectedId} personHref={personHref} editTreeId={editable ? treeId : null} />
          ) : (
            <TreeCanvas treeId={treeId} view={view} selectedId={selectedId} onSelect={onSelect} highlightPath={highlightPath} cardMenuItems={cardMenuItems} />
          )}
        </div>
        <Outlet context={{ view, tree, onSelect }} />
      </div>
      {tree.role === 'owner' ? <DeleteTreeDialog tree={tree} peopleCount={count} open={deletingTree} onOpenChange={setDeletingTree} /> : null}
      {deletingId && editable ? (
        <Suspense fallback={null}>
          <DeletePersonDialog tree={tree} view={view} personId={deletingId} onClose={closeDelete} />
        </Suspense>
      ) : null}
    </main>
  );
}
