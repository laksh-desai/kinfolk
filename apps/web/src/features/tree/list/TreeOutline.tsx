import { cardLabel, toCalendarDay } from '@kinfolk/shared/dates/partialDate';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Button, buttonClasses } from '../../../components/Button';
import { cx } from '../../../lib/cx';
import { usePersonDialogs } from '../people/personDialogStore';
import type { TreeView } from '../useTreeView';
import { outlineTree } from './outlineTree';

interface TreeOutlineProps {
  view: TreeView;
  selectedId: string | null;
  /** Where a person's name leads: their panel in the app, or a detail view on a share link. */
  personHref: (personId: string) => string;
  /** The tree to edit through; null for read-only views (viewers, share links), which get no edit actions. */
  editTreeId: string | null;
}

/**
 * The list/outline view (SPEC §5.3): the same tree grouped by generation and family, with the
 * same actions as the canvas. It is the screen-reader and small-screen path, so everything is
 * plain headings, lists, and links.
 */
export function TreeOutline({ view, selectedId, personHref, editTreeId }: TreeOutlineProps) {
  const generations = useMemo(() => outlineTree(view.index, view.layout), [view.index, view.layout]);
  const today = useMemo(() => toCalendarDay(new Date()), []);
  const openDelete = usePersonDialogs((state) => state.openDelete);
  const nameOf = (id: string) => view.names.get(id) ?? 'Unnamed person';
  const hiddenCount = view.graph.people.length - view.layout.nodes.length;

  const personRow = (personId: string) => {
    const person = view.index.person(personId);
    const name = nameOf(personId);
    const relation = view.relationToFocus.get(personId);
    const details = [
      personId === view.graph.focusPersonId ? 'Focus person' : relation?.label,
      person ? cardLabel(person, today) : null,
      person?.isPlaceholder ? 'Unnamed placeholder' : null,
    ].filter(Boolean);
    return (
      <li key={personId} className={cx('flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2', personId === selectedId && 'rounded-control bg-accent-soft/40 px-2')}>
        <div className="min-w-0">
          <Link
            to={personHref(personId)}
            state={{ focusPanel: true }}
            aria-current={personId === selectedId ? 'true' : undefined}
            className={cx('text-base font-semibold text-accent underline-offset-2 hover:underline', person?.isPlaceholder && 'italic')}
          >
            {name}
          </Link>
          {details.length ? <p className="text-sm text-ink-muted">{details.join(' · ')}</p> : null}
        </div>
        {editTreeId ? (
          <div className="flex flex-wrap gap-2">
            <Link to={`/trees/${editTreeId}/people/${personId}/add`} aria-label={`Add relative of ${name}`} className={buttonClasses('secondary', 'min-h-9 px-3 py-1 text-sm')}>
              Add relative
            </Link>
            <Link to={`/trees/${editTreeId}/people/${personId}/edit`} aria-label={`Edit ${name}`} className={buttonClasses('ghost', 'min-h-9 px-3 py-1 text-sm')}>
              Edit
            </Link>
            <Button variant="danger-quiet" aria-label={`Delete ${name}`} className="min-h-9 px-3 py-1 text-sm" onClick={() => openDelete(personId)}>
              Delete
            </Button>
          </div>
        ) : null}
      </li>
    );
  };

  return (
    <div role="region" aria-label="Family tree list" className="h-full overflow-y-auto bg-ground px-4 py-4 sm:px-6">
      {hiddenCount > 0 ? (
        <p className="mb-3 rounded-control bg-sunken px-3 py-2 text-base">
          {hiddenCount} {hiddenCount === 1 ? 'person is' : 'people are'} in hidden branches. Use “Show descendants” on their relative to list them.
        </p>
      ) : null}
      <div className="flex max-w-4xl flex-col gap-8">
        {generations.map((generation) => (
          <section key={generation.number} aria-labelledby={`generation-${generation.number}`}>
            <h2 id={`generation-${generation.number}`} className="mb-2 text-lg font-semibold">
              Generation {generation.number}
              {generation.number === 1 ? <span className="font-normal text-ink-muted"> — oldest</span> : null}
            </h2>
            <ul className="flex flex-col gap-3">
              {generation.families.map((family) => {
                const partners = [...family.memberIds, ...family.alsoIn];
                const heading = family.unionId ? partners.map(nameOf).join(' and ') : nameOf(family.memberIds[0] ?? '');
                return (
                  <li key={family.unionId ?? family.memberIds[0]} className="rounded-card border border-line bg-surface px-4 py-3">
                    <h3 className="sr-only">{family.unionId ? `Family of ${heading}` : heading}</h3>
                    <ul className="divide-y divide-line">{family.memberIds.map(personRow)}</ul>
                    {family.alsoIn.length > 0 ? (
                      <p className="text-sm text-ink-muted">With {family.alsoIn.map(nameOf).join(' and ')}, listed above.</p>
                    ) : null}
                    {family.childIds.length > 0 ? (
                      <p className="mt-1 text-sm">
                        <span className="font-semibold text-ink-muted">Children: </span>
                        {family.childIds.map((childId, position) => (
                          <span key={childId}>
                            {position > 0 ? ', ' : null}
                            <Link to={personHref(childId)} className="text-accent underline-offset-2 hover:underline">
                              {nameOf(childId)}
                            </Link>
                          </span>
                        ))}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
