import { useQuery } from '@tanstack/react-query';
import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { buttonClasses } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { inputClasses } from '../../components/fieldStyles';
import { Icon } from '../../components/Icon';
import { LoadingRegion } from '../../components/LoadingRegion';
import { Skeleton } from '../../components/Skeleton';
import { cx } from '../../lib/cx';
import { eventsQuery } from './eventsApi';
import { daysUntilLabel, filterEvents, type EventSort } from './filterEvents';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const SORTS: Array<{ value: EventSort; label: string }> = [
  { value: 'soonest', label: 'Soonest' },
  { value: 'person', label: 'Person' },
  { value: 'type', label: 'Event' },
  { value: 'tree', label: 'Family tree' },
];

const longDate = (on: { year: number; month: number; day: number }) => `${MONTHS[on.month - 1]} ${on.day}, ${on.year}`;

/**
 * Key events (SPEC §5.8, §6.4): birthdays and anniversaries derived from the trees you can see,
 * with every column filled in. Year-only dates can't make an event, and the page says so.
 */
export function Component() {
  const searchId = useId();
  const monthId = useId();
  const sortId = useId();
  const events = useQuery(eventsQuery);
  const [query, setQuery] = useState('');
  const [month, setMonth] = useState<number | 'all'>('all');
  const [sort, setSort] = useState<EventSort>('soonest');
  const shown = useMemo(() => filterEvents(events.data?.events ?? [], { query, month, sort }), [events.data, query, month, sort]);
  const needDates = events.data?.needDates ?? [];

  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-screen-xl flex-1 px-4 py-8 outline-none sm:px-6">
      <h1 className="page-title">Key events</h1>
      <p className="mt-1 text-lg text-ink-muted">Birthdays and anniversaries from every family tree you can open, soonest first.</p>

      {events.isPending ? (
        <LoadingRegion label="Loading key events">
          <Skeleton className="mt-8 h-12 w-full" />
          <Skeleton className="mt-2 h-12 w-full" />
          <Skeleton className="mt-2 h-12 w-full" />
        </LoadingRegion>
      ) : events.isError ? (
        <ErrorState error={events.error} title="Key events didn’t load" onRetry={() => void events.refetch()} retrying={events.isRefetching} />
      ) : events.data.events.length === 0 ? (
        <EmptyState icon="calendar" title="No dates to remind you about yet" className="mt-8 rounded-card border border-line bg-surface">
          <p>
            Birthdays need a day and a month, not just a year, and anniversaries come from the year a couple married or got together. Add those dates to
            anyone in your trees and they’ll appear here.
          </p>
          {needDates.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-1">
              {needDates.map((entry) => (
                <li key={entry.treeId}>
                  <Link to={`/trees/${entry.treeId}/needs-detail`} className="font-semibold text-accent underline underline-offset-2">
                    {entry.count} {entry.count === 1 ? 'person' : 'people'} in {entry.treeName} need dates
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4">
              <Link to="/" className={buttonClasses('secondary')}>
                Back to your family trees
              </Link>
            </p>
          )}
        </EmptyState>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1 basis-56">
              <label htmlFor={searchId} className="mb-1 block text-sm font-semibold text-ink-muted">
                Search people or trees
              </label>
              <input id={searchId} type="search" value={query} onChange={(event) => setQuery(event.target.value)} className={inputClasses(false)} autoComplete="off" />
            </div>
            <div>
              <label htmlFor={monthId} className="mb-1 block text-sm font-semibold text-ink-muted">
                Month
              </label>
              <select id={monthId} value={month} onChange={(event) => setMonth(event.target.value === 'all' ? 'all' : Number(event.target.value))} className={inputClasses(false, 'w-auto pr-8')}>
                <option value="all">Every month</option>
                {MONTHS.map((name, index) => (
                  <option key={name} value={index + 1}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={sortId} className="mb-1 block text-sm font-semibold text-ink-muted">
                Sort by
              </label>
              <select id={sortId} value={sort} onChange={(event) => setSort(event.target.value as EventSort)} className={inputClasses(false, 'w-auto pr-8')}>
                {SORTS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <p role="status" className="mt-3 text-base text-ink-muted">
            {shown.length === events.data.events.length
              ? `${shown.length} ${shown.length === 1 ? 'event' : 'events'} in the year ahead`
              : `${shown.length} of ${events.data.events.length} ${events.data.events.length === 1 ? 'event' : 'events'}`}
          </p>

          {shown.length === 0 ? (
            <p className="mt-6 rounded-card border border-line bg-surface px-4 py-6 text-base">
              Nothing matches that search. Try another name, or choose “Every month”.
            </p>
          ) : (
            <ul aria-label="Key events" className="mt-3 flex flex-col divide-y divide-line rounded-card border border-line bg-surface">
              {shown.map((event) => (
                <li key={event.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                  <span
                    aria-hidden="true"
                    className={cx('inline-flex size-9 shrink-0 items-center justify-center rounded-full', event.type === 'birthday' ? 'bg-accent-soft text-accent' : 'bg-info-soft text-info')}
                  >
                    <Icon name={event.type === 'birthday' ? 'calendar' : 'heart'} className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1 basis-64">
                    <span className="block text-base font-semibold">
                      {event.people.map((person, index) => (
                        <span key={person.id}>
                          {index > 0 ? ' and ' : null}
                          <Link to={`/trees/${event.treeId}/people/${person.id}`} className="text-accent underline-offset-2 hover:underline">
                            {person.name}
                          </Link>
                        </span>
                      ))}
                    </span>
                    <span className="block text-sm text-ink-muted">
                      {event.type === 'birthday' ? 'Birthday' : 'Anniversary'}
                      {event.milestone !== null ? (event.type === 'birthday' ? ` · turns ${event.milestone}` : ` · ${event.milestone} years`) : ''} ·{' '}
                      <Link to={`/trees/${event.treeId}`} className="underline-offset-2 hover:underline">
                        {event.treeName}
                      </Link>
                    </span>
                  </span>
                  <span className="text-base">{longDate(event.on)}</span>
                  <span className={cx('rounded-full px-2.5 py-0.5 text-sm font-semibold', event.daysUntil <= 7 ? 'bg-accent text-on-accent' : 'bg-sunken text-ink-muted')}>
                    {daysUntilLabel(event.daysUntil)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {needDates.length > 0 ? (
            <p className="mt-4 text-base text-ink-muted">
              Some people have only a birth year, so they can’t appear here yet.{' '}
              {needDates.map((entry, index) => (
                <span key={entry.treeId}>
                  {index > 0 ? ' · ' : null}
                  <Link to={`/trees/${entry.treeId}/needs-detail`} className="font-semibold text-accent underline underline-offset-2">
                    {entry.count} in {entry.treeName}
                  </Link>
                </span>
              ))}
            </p>
          ) : null}
        </>
      )}
    </main>
  );
}
