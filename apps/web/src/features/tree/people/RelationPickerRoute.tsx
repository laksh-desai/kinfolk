import { RELATIONS, type RelationSpec } from '@kinfolk/shared/relatives/planAddRelative';
import { Link, useParams } from 'react-router-dom';
import { Icon } from '../../../components/Icon';
import { useTreeOutlet } from '../treeOutlet';
import { canEditTree } from '../treePermissions';
import { PanelShell } from './PanelShell';
import { PersonNotFound } from './PersonNotFound';
import { ReadOnlyPanel } from './ReadOnlyPanel';

const HINTS: Partial<Record<RelationSpec['key'], string>> = {
  'aunt-uncle': 'A sibling of a parent',
  'niece-nephew': 'A child of a sibling',
  cousin: 'A child of an aunt or uncle',
  'half-sibling': 'Shares one parent',
  'step-sibling': 'A child of a parent’s partner',
  'step-child': 'A partner’s child',
  'parent-in-law': 'A partner’s parent',
  'sibling-in-law': 'A partner’s sibling, or a sibling’s partner',
  'child-in-law': 'A child’s partner',
};

/**
 * Add relative, step one (SPEC §4.2): every relationship in plain words, relative to this person.
 * Addressable at /trees/:treeId/people/:personId/add.
 */
export function Component() {
  const { personId = '' } = useParams();
  const { view, tree } = useTreeOutlet();
  const person = view.index.person(personId);
  if (!person) return <PersonNotFound treeId={tree.id} />;
  if (!canEditTree(tree)) return <ReadOnlyPanel tree={tree} personId={person.id} />;
  const name = view.names.get(person.id) ?? '';
  const groups = [...new Set(RELATIONS.map((relation) => relation.group))];

  return (
    <PanelShell
      title="Add a relative"
      subtitle={`How are they related to ${name}?`}
      back={{ to: `/trees/${tree.id}/people/${person.id}`, label: `Back to ${name}` }}
      closeTo={`/trees/${tree.id}`}
      closeLabel="Close"
    >
      <div className="flex flex-col gap-5 px-5 py-4">
        {groups.map((group) => (
          <section key={group} aria-labelledby={`group-${group}`}>
            <h3 id={`group-${group}`} className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">
              {group}
            </h3>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {RELATIONS.filter((relation) => relation.group === group).map((relation) => (
                <li key={relation.key}>
                  <Link
                    to={`/trees/${tree.id}/people/${person.id}/add/${relation.key}`}
                    className="flex min-h-11 items-center justify-between gap-2 rounded-control border border-line px-3 py-2 text-base hover:border-accent hover:bg-accent-soft/40"
                  >
                    <span className="flex flex-col">
                      <span className="font-semibold">{relation.label}</span>
                      {HINTS[relation.key] ? <span className="text-sm text-ink-muted">{HINTS[relation.key]}</span> : null}
                    </span>
                    <Icon name="chevron-right" className="size-4 shrink-0 text-ink-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </PanelShell>
  );
}
