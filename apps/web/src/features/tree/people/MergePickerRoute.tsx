import { lifespanLabel } from '@kinfolk/shared/dates/partialDate';
import type { Person } from '@kinfolk/shared/schemas/person';
import { useId, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { inputClasses } from '../../../components/fieldStyles';
import { Icon } from '../../../components/Icon';
import { useTreeOutlet } from '../treeOutlet';
import { canEditTree } from '../treePermissions';
import { PanelShell } from './PanelShell';
import { PersonNotFound } from './PersonNotFound';
import { ReadOnlyPanel } from './ReadOnlyPanel';

const LIMIT = 40;

/**
 * Merge, step one: choose the duplicate. Likely duplicates (same first name, and placeholders)
 * come first. Addressable at /trees/:treeId/people/:personId/merge.
 */
export function Component() {
  const { personId = '' } = useParams();
  const { view, tree } = useTreeOutlet();
  const [query, setQuery] = useState('');
  const searchId = useId();
  const person = view.graph.people.find((candidate) => candidate.id === personId);

  const candidates = useMemo(() => {
    if (!person) return [];
    const first = person.firstName.trim().toLowerCase();
    const score = (other: Person) =>
      (first && other.firstName.trim().toLowerCase() === first ? 0 : other.isPlaceholder || person.isPlaceholder ? 1 : 2);
    return view.graph.people
      .filter((other) => other.id !== person.id)
      .map((other) => ({ person: other, name: view.names.get(other.id) ?? '', score: score(other) }))
      .sort((x, y) => x.score - y.score || x.name.localeCompare(y.name));
  }, [person, view.graph.people, view.names]);

  if (!person) return <PersonNotFound treeId={tree.id} />;
  if (!canEditTree(tree)) return <ReadOnlyPanel tree={tree} personId={person.id} />;
  const name = view.names.get(person.id) ?? '';
  const needle = query.trim().toLowerCase();
  const matches = candidates.filter((candidate) => !needle || candidate.name.toLowerCase().includes(needle));
  const shown = matches.slice(0, LIMIT);

  return (
    <PanelShell
      title={`Merge ${name} with someone`}
      subtitle="For when the same person was entered twice. You’ll choose which details to keep next."
      back={{ to: `/trees/${tree.id}/people/${person.id}`, label: `Back to ${name}` }}
      closeTo={`/trees/${tree.id}/people/${person.id}`}
      closeLabel={`Close and return to ${name}`}
    >
      <div className="flex flex-col gap-3 px-5 py-4">
        <label htmlFor={searchId} className="text-base font-semibold">
          Find the duplicate
        </label>
        <input id={searchId} type="search" value={query} onChange={(event) => setQuery(event.target.value)} className={inputClasses(false)} autoComplete="off" />
        <p role="status" className="text-sm text-ink-muted">
          {matches.length === 0 ? 'No one matches that name.' : matches.length > LIMIT ? `Showing ${LIMIT} of ${matches.length}. Type more of the name to narrow it down.` : `${matches.length} ${matches.length === 1 ? 'person' : 'people'}`}
        </p>
        <ul className="flex flex-col gap-2">
          {shown.map((candidate) => (
            <li key={candidate.person.id}>
              <Link
                to={`/trees/${tree.id}/people/${person.id}/merge/${candidate.person.id}`}
                className="flex min-h-11 items-center justify-between gap-2 rounded-control border border-line px-3 py-2 hover:border-accent hover:bg-accent-soft/40"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-semibold">{candidate.name}</span>
                  <span className="text-sm text-ink-muted">
                    {[lifespanLabel(candidate.person), view.relationToFocus.get(candidate.person.id)?.label, candidate.score === 0 ? 'Same first name' : null].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <Icon name="chevron-right" className="size-4 shrink-0 text-ink-muted" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </PanelShell>
  );
}
