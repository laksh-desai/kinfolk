import { ageLabel, formatPartialDate, lifespanLabel, toCalendarDay } from '@kinfolk/shared/dates/partialDate';
import { directRelatives } from '@kinfolk/shared/relatives/directRelatives';
import { useMemo } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { Avatar } from '../../components/Avatar';
import { useCollapsed } from '../../canvas/useCanvasStore';
import { PanelShell } from './people/PanelShell';
import { PersonActions } from './people/PersonActions';
import { PersonNotFound } from './people/PersonNotFound';
import { RelativesSummary } from './people/RelativesSummary';
import { useTreeOutlet } from './treeOutlet';

const GENDER_WORD = { male: 'Male', female: 'Female', other: 'Other', unknown: 'Not recorded' } as const;
const LIFE_WORD = { living: 'Living', deceased: 'Deceased', unknown: 'Not known' } as const;

/**
 * The docked details panel for the selected person, addressable at /trees/:treeId/people/:personId
 * so a refresh or a pasted link restores it.
 */
export function Component() {
  const { personId = '' } = useParams();
  const { view, tree } = useTreeOutlet();
  const location = useLocation();
  const collapsed = useCollapsed(tree.id);
  const person = view.graph.people.find((candidate) => candidate.id === personId);
  const name = view.names.get(personId) ?? '';
  const relatives = useMemo(() => (person ? directRelatives(view.index, view.resolve, person.id) : null), [view.index, view.resolve, person]);

  if (!person || !relatives) return <PersonNotFound treeId={tree.id} />;

  const relation = view.relationToFocus.get(person.id);
  const node = view.layout.nodes.find((candidate) => candidate.personId === person.id);
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
    <PanelShell
      title={name}
      subtitle={[lifespanLabel(person), relation?.label].filter(Boolean).join(' · ')}
      leading={<Avatar name={name} src={person.photoUrl} size="md" />}
      closeTo={`/trees/${tree.id}`}
      closeLabel={`Close details for ${name}`}
      focusKey={(location.state as { focusPanel?: boolean } | null)?.focusPanel ? location.key : null}
    >
      {person.isPlaceholder ? (
        <p className="mx-5 mt-4 rounded-control border border-dashed border-line-strong px-3 py-2 text-base text-ink-muted">
          This is an unnamed placeholder the app added to connect relatives. Give them a name whenever you know it.
        </p>
      ) : null}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 px-5 py-4 text-base">
        {facts.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="font-semibold text-ink-muted">{label}</dt>
            <dd className="min-w-0 break-words">{value}</dd>
          </div>
        ))}
      </dl>
      {person.notes ? <p className="mx-5 mb-4 rounded-control bg-sunken px-3 py-2 text-base">{person.notes}</p> : null}
      <h3 className="px-5 pb-1 text-base font-semibold">Family</h3>
      <RelativesSummary treeId={tree.id} relatives={relatives} names={view.names} />
      <PersonActions
        tree={tree}
        person={person}
        name={name}
        isFocus={view.graph.focusPersonId === person.id}
        focusId={view.graph.focusPersonId}
        hasDescendants={Boolean(node?.hasDescendants) || collapsed.includes(person.id)}
      />
    </PanelShell>
  );
}
