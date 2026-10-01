import { useMemo, useRef } from 'react';
import { SearchBox, type SearchCandidate } from '../../../canvas/SearchBox';
import { useCanvasStore } from '../../../canvas/useCanvasStore';
import { IconButton } from '../../../components/IconButton';
import { announce } from '../../../lib/announcer';
import { ShortcutHelpDialog } from '../ShortcutHelpDialog';
import type { TreeView } from '../useTreeView';
import { useTreeShortcuts } from '../useTreeShortcuts';

interface TreeSearchProps {
  view: TreeView;
  /** Select the chosen person; the view then brings them into sight on its own. */
  onChoose: (personId: string) => void;
  /** The canvas has a Find button in its toolbar; the list has nothing, so it gets one here. */
  showTrigger?: boolean;
}

/**
 * Find a person, for whichever view is showing (SPEC §5.3). One search for the tree page: the
 * canvas dims the cards that don't match and centres the choice; the list keeps only the people
 * who match and lands on the chosen row. Also mounts the page-level shortcuts.
 */
export function TreeSearch({ view, onChoose, showTrigger = false }: TreeSearchProps) {
  useTreeShortcuts();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchOpen = useCanvasStore((state) => state.searchOpen);
  const setSearchOpen = useCanvasStore((state) => state.setSearchOpen);
  const query = useCanvasStore((state) => state.searchQuery);
  const setSearchQuery = useCanvasStore((state) => state.setSearchQuery);
  const requestReveal = useCanvasStore((state) => state.requestReveal);

  // Only people the view can show: a collapsed branch is not findable until it is opened.
  const candidates = useMemo<SearchCandidate[]>(() => {
    const shown = new Set(view.layout.nodes.map((node) => node.personId));
    return view.graph.people
      .filter((person) => shown.has(person.id))
      .map((person) => ({ id: person.id, name: view.names.get(person.id) ?? '', detail: view.relationToFocus.get(person.id)?.label ?? null }));
  }, [view.graph.people, view.layout.nodes, view.names, view.relationToFocus]);

  const close = () => {
    setSearchOpen(false);
    setSearchQuery('');
  };

  const choose = (personId: string) => {
    close();
    onChoose(personId);
    requestReveal(personId);
    announce(`Found ${view.names.get(personId) ?? 'person'}`);
  };

  const dismiss = () => {
    close();
    // Back to the card that holds the canvas's tab stop, or to the button that opened the search.
    const card = document.querySelector<HTMLElement>('button[data-person-id][tabindex="0"]');
    (card ?? triggerRef.current)?.focus();
  };

  return (
    <>
      {searchOpen ? (
        <div data-canvas-overlay className="absolute right-3 top-3 z-20">
          <SearchBox candidates={candidates} query={query} onQueryChange={setSearchQuery} onChoose={choose} onClose={dismiss} />
        </div>
      ) : showTrigger ? (
        <div className="absolute right-3 top-3 z-20">
          <IconButton ref={triggerRef} icon="search" label="Find a person" shortcut="/" variant="secondary" onClick={() => setSearchOpen(true)} />
        </div>
      ) : null}
      <ShortcutHelpDialog />
    </>
  );
}
