import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { IconButton } from '../components/IconButton';
import { cx } from '../lib/cx';

export interface SearchCandidate {
  id: string;
  name: string;
  detail: string | null;
}

interface SearchBoxProps {
  candidates: readonly SearchCandidate[];
  query: string;
  onQueryChange: (query: string) => void;
  onChoose: (id: string) => void;
  onClose: () => void;
}

function normalise(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

export function matchesQuery(candidate: Pick<SearchCandidate, 'name' | 'detail'>, query: string): boolean {
  const needle = normalise(query.trim());
  if (!needle) return true;
  return normalise(`${candidate.name} ${candidate.detail ?? ''}`).includes(needle);
}

/** Find a person: an ARIA combobox. Typing filters (cards that don't match dim); choosing selects and zooms to them. */
export function SearchBox({ candidates, query, onQueryChange, onChoose, onClose }: SearchBoxProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [active, setActive] = useState(0);
  const results = useMemo(() => (query.trim() ? candidates.filter((candidate) => matchesQuery(candidate, query)).slice(0, 8) : []), [candidates, query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => setActive(0), [query]);

  const choose = (index: number) => {
    const result = results[index];
    if (result) onChoose(result.id);
  };

  return (
    <div className="pointer-events-auto w-80 max-w-[calc(100vw-2rem)] rounded-card border border-line bg-surface shadow-card">
      <div className="flex items-center gap-1 p-1">
        <Icon name="search" className="ml-2 size-5 text-ink-muted" />
        <label htmlFor={`${listId}-input`} className="sr-only">
          Find a person by name
        </label>
        <input
          ref={inputRef}
          id={`${listId}-input`}
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
          value={query}
          placeholder="Find a person"
          autoComplete="off"
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActive((index) => Math.min(index + 1, results.length - 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActive((index) => Math.max(index - 1, 0));
            } else if (event.key === 'Enter') {
              event.preventDefault();
              choose(active);
            } else if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              onClose();
            }
            event.stopPropagation();
          }}
          className="min-h-11 min-w-0 flex-1 bg-transparent px-2 text-base text-ink outline-none"
        />
        <IconButton icon="x" label="Close search" onClick={onClose} />
      </div>
      <div id={listId} role="listbox" aria-label="Matching people" className={cx('max-h-80 overflow-y-auto border-t border-line p-1', results.length === 0 && 'hidden')}>
        {results.map((result, index) => (
          // Options are driven from the combobox input (arrow keys + Enter via aria-activedescendant),
          // so they take pointer clicks only, per the ARIA combobox pattern.
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- keyboard handled by the combobox input above
          <div
            key={result.id}
            id={`${listId}-${index}`}
            role="option"
            tabIndex={-1}
            aria-selected={index === active}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => choose(index)}
            className={cx('flex min-h-11 cursor-pointer flex-col justify-center rounded-md px-3 py-1.5', index === active ? 'bg-accent-soft' : 'hover:bg-sunken')}
          >
            <span className="font-semibold text-ink">{result.name}</span>
            {result.detail ? <span className="text-sm text-ink-muted">{result.detail}</span> : null}
          </div>
        ))}
      </div>
      {query.trim() && results.length === 0 ? (
        <p role="status" className="border-t border-line px-4 py-3 text-base text-ink-muted">
          No one in this tree matches “{query.trim()}”.
        </p>
      ) : null}
    </div>
  );
}
