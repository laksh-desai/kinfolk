import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { buttonClasses } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { Icon } from '../../components/Icon';
import { LoadingRegion } from '../../components/LoadingRegion';
import { Skeleton } from '../../components/Skeleton';
import { StatusBadge } from '../../components/StatusBadge';
import { Wordmark } from '../../components/Wordmark';
import { ApiError, describeError } from '../../lib/api';
import { cx } from '../../lib/cx';
import { queryClient } from '../../lib/queryClient';
import { relativeTime } from '../../lib/relativeTime';
import { TreeCanvas } from '../../canvas/TreeCanvas';
import { useCollapsed } from '../../canvas/useCanvasStore';
import { sessionQuery } from '../auth/sessionQuery';
import { TreeOutline } from '../tree/list/TreeOutline';
import { useTreeView } from '../tree/useTreeView';
import { ReviewDecisionForm, notifyDecision } from './ReviewDecisionForm';
import { ReviewPersonPanel } from './ReviewPersonPanel';
import { reviewApi, reviewTreeQuery } from './reviewApi';

const EMPTY = { people: [], unions: [], parentChildren: [], focusPersonId: null };

/**
 * The reviewer's screen (SPEC §5.7), at /review/:token. Read-only, with planning answers
 * visible, and the two decisions. Requires signing in: a change request needs an author.
 */
export function Component() {
  const { token = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const session = useQuery(sessionQuery);
  const review = useQuery({ ...reviewTreeQuery(token), enabled: Boolean(session.data) });
  const graph = review.data?.graph ?? EMPTY;
  const viewKey = `review:${token.slice(0, 24)}`;
  const collapsed = useCollapsed(viewKey);
  const view = useTreeView(graph, collapsed);
  const selectedId = params.get('person');
  const listView = params.get('view') === 'list';
  const hrefFor = useCallback(
    (personId: string | null, list = listView) => {
      const next = new URLSearchParams();
      if (personId) next.set('person', personId);
      if (list) next.set('view', 'list');
      const query = next.toString();
      return query ? `/review/${token}?${query}` : `/review/${token}`;
    },
    [token, listView],
  );
  const onSelect = useCallback((personId: string | null) => navigate(hrefFor(personId), { replace: true }), [navigate, hrefFor]);
  const selected = useMemo(() => graph.people.find((person) => person.id === selectedId), [graph.people, selectedId]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: reviewTreeQuery(token).queryKey });
  };

  const frame = (children: React.ReactNode) => (
    <div className="flex min-h-screen flex-col bg-ground">
      <header className="border-b border-line bg-surface px-4 py-2 sm:px-6">
        <Wordmark />
      </header>
      <main id="main" tabIndex={-1} className="flex flex-1 items-start justify-center px-4 py-10 outline-none">
        {children}
      </main>
    </div>
  );

  if (session.isPending) return frame(<LoadingRegion label="Opening the review"><Skeleton className="h-8 w-64" /></LoadingRegion>);

  if (!session.data) {
    return frame(
      <EmptyState icon="lock" title="Sign in to review this family tree" className="rounded-card border border-line bg-surface">
        <p>Your decision is recorded against your name, so you need an account. It’s free, and takes a moment.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <Link to={`/login?${new URLSearchParams({ returnTo: `/review/${token}` })}`} className={buttonClasses('primary')}>
            Sign in
          </Link>
          <Link to={`/signup?${new URLSearchParams({ returnTo: `/review/${token}` })}`} className={buttonClasses('secondary')}>
            Create an account
          </Link>
        </div>
      </EmptyState>,
    );
  }

  if (review.isPending) return frame(<LoadingRegion label="Opening the family tree"><Skeleton className="h-8 w-64" /><Skeleton className="mt-4 h-96 w-full" /></LoadingRegion>);

  if (review.isError) {
    const status = review.error instanceof ApiError ? review.error.status : 0;
    return frame(
      <EmptyState
        icon={status === 410 ? 'clock' : 'lock'}
        title={status === 410 ? 'This review was withdrawn' : status === 403 ? 'This review belongs to someone else' : 'This review link can’t be opened'}
        className="rounded-card border border-line bg-surface"
      >
        {describeError(review.error)}
      </EmptyState>,
    );
  }

  const { tree, assignment, changeRequests } = review.data;
  const decided = assignment.decision !== null && tree.status !== 'in_review';
  const placeholders = graph.people.filter((person) => person.isPlaceholder).length;

  return (
    <div className="flex h-screen min-h-0 flex-col bg-ground">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-4 py-2 sm:px-6">
        <Wordmark />
        <h1 className="min-w-0 truncate font-serif text-2xl font-semibold">{tree.name}</h1>
        <StatusBadge status={tree.status} />
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-sm font-semibold text-ink-muted">
          <Icon name="shield" className="size-4" />
          You’re reviewing this tree
        </span>
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
      </header>
      <main id="main" tabIndex={-1} className="flex min-h-0 flex-1 outline-none">
        <div className="relative min-h-0 min-w-0 flex-1">
          {graph.people.length === 0 ? (
            <EmptyState icon="tree" title="This family tree is empty" className="py-16">
              There’s nobody in it yet, so there’s nothing to review. Let the owner know.
            </EmptyState>
          ) : listView ? (
            <TreeOutline view={view} selectedId={selectedId} personHref={(personId) => hrefFor(personId, true)} editTreeId={null} />
          ) : (
            <TreeCanvas treeId={viewKey} view={view} selectedId={selectedId} onSelect={onSelect} />
          )}
        </div>
        <aside aria-label="Review" className="flex w-full max-w-md shrink-0 flex-col overflow-y-auto border-l border-line bg-surface md:w-[24rem]">
          <div className="flex flex-col gap-2 px-5 py-4">
            <p className="text-base">
              <span className="font-semibold">{assignment.sentBy ?? 'The owner'}</span> sent this to you {relativeTime(assignment.sentAt)}.
            </p>
            {assignment.note ? <p className="whitespace-pre-line rounded-control bg-sunken px-3 py-2 text-base">{assignment.note}</p> : null}
            <p className="text-sm text-ink-muted">
              {graph.people.length} {graph.people.length === 1 ? 'person' : 'people'}
              {placeholders > 0 ? ` · ${placeholders} still unnamed, which is allowed` : ''}
            </p>
            {decided ? (
              <p className="rounded-control bg-sunken px-3 py-2 text-base">
                You {assignment.decision === 'approved' ? 'approved' : 'asked for changes on'} this tree {assignment.decidedAt ? relativeTime(assignment.decidedAt) : 'already'}. The owner will
                send it back if they want another look.
              </p>
            ) : null}
          </div>
          {changeRequests.length > 0 ? (
            <section aria-labelledby="notes-heading" className="border-t border-line px-5 py-4">
              <h2 id="notes-heading" className="mb-2 text-lg font-semibold">
                Notes so far
              </h2>
              <ul className="flex flex-col gap-2">
                {changeRequests.map((request) => (
                  <li key={request.id} className="rounded-control bg-sunken px-3 py-2">
                    <p className="whitespace-pre-line text-base">{request.body}</p>
                    <p className="text-sm text-ink-muted">
                      {request.author ?? 'Reviewer'} · {relativeTime(request.createdAt)} · {request.status === 'resolved' ? 'Marked resolved' : 'Open'}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {selected ? <ReviewPersonPanel person={selected} name={view.names.get(selected.id) ?? ''} relation={view.relationToFocus.get(selected.id)?.label ?? null} /> : null}
          {tree.status === 'in_review' ? (
            <ReviewDecisionForm
              treeName={tree.name}
              onApprove={async () => {
                await reviewApi.approve(token);
                await refresh();
                notifyDecision(`You approved “${tree.name}”. The owner has been told.`);
              }}
              onRequestChanges={async (body) => {
                await reviewApi.requestChanges(token, body);
                await refresh();
                notifyDecision('Your notes were sent to the owner.');
              }}
            />
          ) : null}
        </aside>
      </main>
    </div>
  );
}
