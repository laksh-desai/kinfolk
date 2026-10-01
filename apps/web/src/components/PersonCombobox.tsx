import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { cx } from '../lib/cx';

export interface PersonCandidate {
  id: string;
  name: string;
  detail: string | null;
}

interface PersonComboboxProps {
  /** The accessible name of the field; shown unless `hideLabel`. */
  label: string;
  hideLabel?: boolean;
  candidates: readonly PersonCandidate[];
  query: string;
  onQueryChange: (query: string) => void;
  onChoose: (id: string) => void;
  /** Escape in the field, after the field has handled its own list. */
  onEscape?: () => void;
  placeholder?: string;
  /** Focus the field as soon as it appears — for a search box the person just asked to open. */
  focusOnMount?: boolean;
  /** Rendered between the field and the list — the canvas puts its close button here. */
  trailing?: ReactNode;
  /** The field's frame; the canvas search supplies its own. */
  className?: string;
}

function normalise(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

export function matchesQuery(candidate: Pick<PersonCandidate, 'name' | 'detail'>, query: string): boolean {
  const needle = normalise(query.trim());
  if (!needle) return true;
  return normalise(`${candidate.name} ${candidate.detail ?? ''}`).includes(needle);
}

/**
 * Pick a person by typing part of their name: an ARIA combobox over a listbox of the first few
 * matches, driven from the input (arrows, Enter, Escape). Used by the tree search and by any
 * screen that would otherwise offer a `<select>` of everyone in the tree.
 */
export function PersonCombobox({
  label,
  hideLabel = false,
  candidates,
  query,
  onQueryChange,
  onChoose,
  onEscape,
  placeholder = 'Type a name',
  focusOnMount = false,
  trailing,
  className,
}: PersonComboboxProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const results = useMemo(() => (query.trim() ? candidates.filter((candidate) => matchesQuery(candidate, query)).slice(0, 8) : []), [candidates, query]);
  const showing = open && results.length > 0;

  useEffect(() => {
    if (focusOnMount) inputRef.current?.focus();
  }, [focusOnMount]);
  useEffect(() => setActive(0), [query]);

  const choose = (index: number) => {
    const result = results[index];
    if (!result) return;
    setOpen(false);
    onChoose(result.id);
  };

  return (
    <div className={cx('flex flex-col', className)}>
      <label htmlFor={`${listId}-input`} className={cx('text-sm font-semibold text-ink-muted', hideLabel && 'sr-only')}>
        {label}
      </label>
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          id={`${listId}-input`}
          role="combobox"
          aria-expanded={showing}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showing && results[active] ? `${listId}-${active}` : undefined}
          value={query}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(event) => {
            setOpen(true);
            onQueryChange(event.target.value);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
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
              if (showing) setOpen(false);
              else onEscape?.();
            }
            event.stopPropagation();
          }}
          className={cx('min-h-11 min-w-0 flex-1 bg-transparent px-2 text-base text-ink outline-none', !trailing && 'rounded-control border border-line-strong bg-surface focus:border-accent')}
        />
        {trailing}
      </div>
      <div id={listId} role="listbox" aria-label={`People matching ${label.toLowerCase()}`} className={cx('max-h-80 overflow-y-auto border-t border-line p-1', !showing && 'hidden')}>
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
      {open && query.trim() && results.length === 0 ? (
        <p role="status" className="border-t border-line px-4 py-3 text-base text-ink-muted">
          No one in this tree matches “{query.trim()}”.
        </p>
      ) : null}
    </div>
  );
}
