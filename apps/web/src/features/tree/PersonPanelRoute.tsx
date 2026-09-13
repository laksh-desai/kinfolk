import { ageLabel, formatPartialDate, lifespanLabel, toCalendarDay } from '@kinfolk/shared/dates/partialDate';
import { useEffect, useRef } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Avatar } from '../../components/Avatar';
import { Button, buttonClasses } from '../../components/Button';
import { IconButton } from '../../components/IconButton';
import { useCanvasStore, useCollapsed } from '../../canvas/useCanvasStore';
import { useTreeOutlet } from './treeOutlet';

const GENDER_WORD = { male: 'Male', female: 'Female', other: 'Other', unknown: 'Not recorded' } as const;
const LIFE_WORD = { living: 'Living', deceased: 'Deceased', unknown: 'Not known' } as const;

/**
 * The docked details panel for the selected person, addressable at /trees/:treeId/people/:personId
 * so a refresh or a pasted link restores it.
 */
export function Component() {
  const { personId = '' } = useParams();
  const { view, tree, onSelect } = useTreeOutlet();
  const location = useLocation();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const collapsed = useCollapsed(tree.id);
  const toggleCollapsed = useCanvasStore((state) => state.toggleCollapsed);
  const person = view.graph.people.find((candidate) => candidate.id === personId);
  const name = view.names.get(personId) ?? '';

  useEffect(() => {
    if ((location.state as { focusPanel?: boolean } | null)?.focusPanel) headingRef.current?.focus();
  }, [location.state, personId]);

  if (!person) {
    return (
      <aside aria-label="Person details" className="flex w-full max-w-sm flex-col gap-3 border-l border-line bg-surface p-5">
        <h2 className="text-xl font-semibold">That person isn’t in this tree</h2>
        <p className="text-base text-ink-muted">They may have been removed, or the link is from a different family tree.</p>
        <Link to={`/trees/${tree.id}`} className={buttonClasses('primary', 'self-start')}>
          Back to the whole tree
        </Link>
      </aside>
    );
  }

  const relation = view.relationToFocus.get(person.id);
  const node = view.layout.nodes.find((candidate) => candidate.personId === person.id);
  const isCollapsed = collapsed.includes(person.id);
  const age = ageLabel(person, toCalendarDay(new Date()));
  const facts: Array<[string, string]> = [
    ['Relationship', relation?.label ?? '—'],
    ['Born', person.birthDate ? formatPartialDate(person.birthDate, 'long') : 'Not recorded'],
    ...(person.lifeStatus === 'deceased' ? ([['Died', person.deathDate ? formatPartialDate(person.deathDate, 'long') : 'Date not recorded']] as Array<[string, string]>) : []),
    ['Status', age ? `${LIFE_WORD[person.lifeStatus]} · ${age}` : LIFE_WORD[person.lifeStatus]],
    ['Gender', GENDER_WORD[person.gender]],
    ...(person.address?.formatted ? ([['Address', person.address.formatted]] as Array<[string, string]>) : []),
    ...(person.profession ? ([['Profession', person.profession]] as Array<[string, string]>) : []),
  ];

  return (
    <aside
      aria-labelledby="person-panel-heading"
      className="fixed inset-0 z-30 flex flex-col overflow-y-auto bg-surface md:static md:z-auto md:w-[24rem] md:shrink-0 md:border-l md:border-line"
    >
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={name} src={person.photoUrl} size="md" />
          <div className="min-w-0">
            <h2 id="person-panel-heading" ref={headingRef} tabIndex={-1} className="text-xl font-semibold outline-none">
              {name}
            </h2>
            <p className="text-base text-ink-muted">{[lifespanLabel(person), relation?.label].filter(Boolean).join(' · ')}</p>
          </div>
        </div>
        <IconButton icon="x" label={`Close details for ${name}`} onClick={() => onSelect(null)} />
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 px-5 py-4 text-base">
        {facts.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="font-semibold text-ink-muted">{label}</dt>
            <dd className="min-w-0 break-words">{value}</dd>
          </div>
        ))}
      </dl>
      {person.notes ? <p className="mx-5 rounded-control bg-sunken px-3 py-2 text-base">{person.notes}</p> : null}
      <div className="mt-auto flex flex-wrap gap-2 border-t border-line px-5 py-4">
        {node?.hasDescendants || isCollapsed ? (
          <Button icon={isCollapsed ? 'expand' : 'collapse'} onClick={() => toggleCollapsed(tree.id, person.id)}>
            {isCollapsed ? 'Show descendants' : 'Hide descendants'}
          </Button>
        ) : null}
      </div>
    </aside>
  );
}
