import { Icon } from '../components/Icon';
import { IconButton } from '../components/IconButton';
import { PersonCombobox, matchesQuery, type PersonCandidate } from '../components/PersonCombobox';

export type SearchCandidate = PersonCandidate;
export { matchesQuery };

interface SearchBoxProps {
  candidates: readonly SearchCandidate[];
  query: string;
  onQueryChange: (query: string) => void;
  onChoose: (id: string) => void;
  onClose: () => void;
}

/** Find a person: the combobox in a floating card, with a close button. Typing filters; choosing selects and zooms to them. */
export function SearchBox({ candidates, query, onQueryChange, onChoose, onClose }: SearchBoxProps) {
  return (
    <div className="pointer-events-auto w-80 max-w-[calc(100vw-2rem)] rounded-card border border-line bg-surface shadow-card">
      <div className="flex items-center p-1 pl-3">
        <Icon name="search" className="size-5 shrink-0 text-ink-muted" />
        <PersonCombobox
          label="Find a person by name"
          hideLabel
          candidates={candidates}
          query={query}
          onQueryChange={onQueryChange}
          onChoose={onChoose}
          onEscape={onClose}
          placeholder="Find a person"
          focusOnMount
          trailing={<IconButton icon="x" label="Close search" onClick={onClose} />}
          className="min-w-0 flex-1"
        />
      </div>
    </div>
  );
}
