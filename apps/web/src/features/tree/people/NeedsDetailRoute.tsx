import { Link } from 'react-router-dom';
import { EmptyState } from '../../../components/EmptyState';
import { useTreeOutlet } from '../treeOutlet';
import { canEditTree } from '../treePermissions';
import { PanelShell } from './PanelShell';

/**
 * "Needs detail" (SPEC §4.2, §5.3): unnamed placeholders and people without a birth date, so the
 * tree can be finished in one pass. Addressable at /trees/:treeId/needs-detail.
 */
export function Component() {
  const { view, tree } = useTreeOutlet();
  const editable = canEditTree(tree);
  const byName = (a: { id: string }, b: { id: string }) => (view.names.get(a.id) ?? '').localeCompare(view.names.get(b.id) ?? '');
  const placeholders = view.graph.people.filter((person) => person.isPlaceholder).sort(byName);
  const noBirthDate = view.graph.people.filter((person) => !person.isPlaceholder && !person.birthDate).sort(byName);
  const target = (id: string) => `/trees/${tree.id}/people/${id}${editable ? '/edit' : ''}`;

  const list = (people: typeof placeholders, action: string) => (
    <ul className="flex flex-col gap-1">
      {people.map((person) => (
        <li key={person.id} className="flex flex-wrap items-baseline justify-between gap-x-3">
          <Link to={target(person.id)} className="min-h-8 text-accent underline-offset-2 hover:underline">
            {view.names.get(person.id)}
          </Link>
          <span className="text-sm text-ink-muted">{editable ? action : view.relationToFocus.get(person.id)?.label}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <PanelShell title="Needs detail" subtitle="People to finish off. None of this blocks review." closeTo={`/trees/${tree.id}`} closeLabel="Close needs detail">
      {placeholders.length === 0 && noBirthDate.length === 0 ? (
        <EmptyState icon="check-circle" title="Nothing left to fill in" headingLevel={3}>
          Everyone has a name and a birth date. Add more detail to anyone from their card whenever you like.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-6 px-5 py-4 text-base">
          <section aria-labelledby="needs-placeholders">
            <h3 id="needs-placeholders" className="mb-1 font-semibold">
              Unnamed placeholders ({placeholders.length})
            </h3>
            <p className="mb-2 text-sm text-ink-muted">Added to connect relatives. Name them, or merge them with the real person if they’re already in the tree.</p>
            {placeholders.length ? list(placeholders, 'Add a name') : <p className="text-ink-muted">None.</p>}
          </section>
          <section aria-labelledby="needs-birth">
            <h3 id="needs-birth" className="mb-1 font-semibold">
              No birth date ({noBirthDate.length})
            </h3>
            <p className="mb-2 text-sm text-ink-muted">A year is enough. Birthdays need the day and month too.</p>
            {noBirthDate.length ? list(noBirthDate, 'Add a birth date') : <p className="text-ink-muted">None.</p>}
          </section>
        </div>
      )}
    </PanelShell>
  );
}
