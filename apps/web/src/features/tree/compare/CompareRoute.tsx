import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { InlineSelect } from '../../../components/InlineSelect';
import { PanelShell } from '../people/PanelShell';
import { useTreeOutlet } from '../treeOutlet';
import { describeRelationship } from './describeRelationship';

/**
 * Compare two people (SPEC §4.4): the relationship both ways and the path that connects them,
 * drawn on the canvas. Addressable at /trees/:treeId/compare?a=…&b=….
 */
export function Component() {
  const { view, tree } = useTreeOutlet();
  const [params, setParams] = useSearchParams();
  const a = view.index.person(params.get('a') ?? '') ? (params.get('a') as string) : '';
  const b = view.index.person(params.get('b') ?? '') ? (params.get('b') as string) : '';
  const options = useMemo(
    () => [{ value: '', label: 'Choose a person…' }, ...view.graph.people.map((person) => ({ value: person.id, label: view.names.get(person.id) ?? '' })).sort((x, y) => x.label.localeCompare(y.label))],
    [view.graph.people, view.names],
  );
  const choose = (key: 'a' | 'b', value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const nameOf = (id: string) => view.names.get(id) ?? 'Unnamed person';
  const ready = a && b && a !== b;
  const forward = ready ? view.resolve(b, a) : null;
  const backward = ready ? view.resolve(a, b) : null;

  return (
    <PanelShell title="Compare two people" subtitle="See how any two people are related, both ways." closeTo={`/trees/${tree.id}`} closeLabel="Close compare">
      <div className="flex flex-col gap-4 px-5 py-4 text-base">
        <InlineSelect label="First person" value={a} options={options} onChange={(value) => choose('a', value)} />
        <InlineSelect label="Second person" value={b} options={options} onChange={(value) => choose('b', value)} />
        {a && a === b ? <p className="text-ink-muted">Choose two different people.</p> : null}
        {!ready && a !== b ? <p className="text-ink-muted">Choose both people to see their relationship and the path between them on the tree.</p> : null}
        {forward && backward ? (
          <div role="status" className="flex flex-col gap-3">
            <p className="rounded-control bg-accent-soft/50 px-3 py-2 font-semibold">{describeRelationship(nameOf(a), nameOf(b), forward)}</p>
            <p className="rounded-control bg-accent-soft/50 px-3 py-2 font-semibold">{describeRelationship(nameOf(b), nameOf(a), backward)}</p>
            {backward.path.length > 1 ? (
              <div>
                <h3 id="compare-path-heading" className="mb-1 font-semibold">
                  How they connect
                </h3>
                <ol aria-labelledby="compare-path-heading" className="flex flex-col gap-1">
                  {backward.path.map((id, step) => (
                    <li key={id} className="flex items-center gap-2">
                      <span aria-hidden="true" className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-on-accent">
                        {step + 1}
                      </span>
                      <Link to={`/trees/${tree.id}/people/${id}`} className="text-accent underline-offset-2 hover:underline">
                        {nameOf(id)}
                      </Link>
                    </li>
                  ))}
                </ol>
                <p className="mt-2 text-sm text-ink-muted">The path is highlighted on the tree.</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </PanelShell>
  );
}
