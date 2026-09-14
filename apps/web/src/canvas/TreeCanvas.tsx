import type { LayoutBranch } from '@kinfolk/shared/layout/layoutTypes';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import type { TreeView } from '../features/tree/useTreeView';
import { announce } from '../lib/announcer';
import { BranchBrackets } from './BranchBrackets';
import { CardMenu, type CardMenuItem } from './CardMenu';
import { CanvasToolbar } from './CanvasToolbar';
import { visibleNodes } from './culling';
import { EdgeLayer } from './EdgeLayer';
import { nextSelection, NAV_KEYS, type NavKey } from './keyboardNav';
import { Minimap } from './Minimap';
import { PersonCard } from './PersonCard';
import { matchesQuery, SearchBox } from './SearchBox';
import { useCanvasStore } from './useCanvasStore';
import {
  centreOn,
  fitToContent,
  MAX_SCALE,
  MIN_SCALE,
  panBy,
  revealRect,
  steppedScale,
  visibleWorldRect,
  zoomAt,
  type Size,
  type Viewport,
} from './viewport';

export const MINIMAP_ABOVE = 25;

interface TreeCanvasProps {
  treeId: string;
  view: TreeView;
  selectedId: string | null;
  /** Select a person (null clears). `openPanel` moves focus into the details panel. */
  onSelect: (personId: string | null, options?: { openPanel?: boolean }) => void;
  /** People along a Compare path, in order: their connectors are drawn in the accent colour and the rest dims. */
  highlightPath?: readonly string[] | null;
  /** Actions for a card's menu (right-click, Menu key, Shift+F10). */
  cardMenuItems?: (personId: string) => CardMenuItem[];
}

const FALLBACK_SIZE: Size = { width: 1024, height: 700 };

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(element?.closest('input, textarea, select, [contenteditable="true"]'));
}

/**
 * The tree canvas: absolutely positioned cards over one SVG edge layer, inside a single
 * CSS-transformed pan/zoom layer. There is no fixed stage; the canvas fills its container
 * and opens fitted to the tree.
 */
export function TreeCanvas({ treeId, view, selectedId, onSelect, highlightPath = null, cardMenuItems }: TreeCanvasProps) {
  const { layout, graph, names, relationToFocus, marriedInBranches } = view;
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size | null>(null);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, scale: 1 });
  const [fitNotice, setFitNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState<{ personId: string; x: number; y: number } | null>(null);
  const fittedFor = useRef<string | null>(null);
  const drag = useRef<{ pointerId: number; x: number; y: number; moved: boolean } | null>(null);
  const helpId = useId();
  const showBranches = useCanvasStore((state) => state.showBranches);
  const setShowBranches = useCanvasStore((state) => state.setShowBranches);
  const searchOpen = useCanvasStore((state) => state.searchOpen);
  const setSearchOpen = useCanvasStore((state) => state.setSearchOpen);
  const toggleCollapsed = useCanvasStore((state) => state.toggleCollapsed);

  const people = useMemo(() => new Map(graph.people.map((person) => [person.id, person])), [graph]);
  const nodeById = useMemo(() => new Map(layout.nodes.map((node) => [node.personId, node])), [layout]);
  const focusId = graph.focusPersonId;
  const pathKey = highlightPath && highlightPath.length > 1 ? highlightPath.join('>') : null;
  const onPath = useMemo(() => (pathKey ? new Set(pathKey.split('>')) : null), [pathKey]);
  const highlightPairs = useMemo(() => {
    if (!pathKey) return undefined;
    const ids = pathKey.split('>');
    const pairs = new Set<string>();
    for (let step = 1; step < ids.length; step += 1) {
      pairs.add(`${ids[step - 1]}|${ids[step]}`);
      pairs.add(`${ids[step]}|${ids[step - 1]}`);
    }
    return pairs;
  }, [pathKey]);
  const effectiveSize = size ?? FALLBACK_SIZE;

  // Track the container size; the canvas has no fixed dimensions of its own.
  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const measure = () => {
      const width = element.clientWidth || FALLBACK_SIZE.width;
      const height = element.clientHeight || FALLBACK_SIZE.height;
      setSize((previous) => (previous && previous.width === width && previous.height === height ? previous : { width, height }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const fit = useCallback(
    (announceIt: boolean) => {
      const focusNode = (selectedId && nodeById.get(selectedId)) || (focusId && nodeById.get(focusId)) || null;
      const result = fitToContent(layout.bounds, effectiveSize, { fallbackFocus: focusNode });
      setViewport(result.viewport);
      setFitNotice(result.fitsEntirely ? null : 'This tree is too large to show whole. Showing the area around the focus person — use search or the overview map to move around.');
      if (announceIt) announce(result.fitsEntirely ? 'Whole tree fitted on screen' : 'Showing the area around the focus person');
    },
    [layout.bounds, effectiveSize, nodeById, selectedId, focusId],
  );

  // Fit to content on load, and once more when the real size first becomes known.
  useLayoutEffect(() => {
    const key = `${treeId}:${size ? 'sized' : 'fallback'}:${layout.nodes.length > 0}`;
    if (fittedFor.current === key) return;
    fittedFor.current = key;
    fit(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on first sizing and tree change; later layout changes keep the user's view
  }, [treeId, size, layout.nodes.length > 0]);

  const focusCard = useCallback((personId: string) => {
    requestAnimationFrame(() => {
      containerRef.current?.querySelector<HTMLButtonElement>(`button[data-person-id="${personId}"]`)?.focus({ preventScroll: true });
    });
  }, []);

  // Frame the whole Compare path when it changes.
  useEffect(() => {
    if (!pathKey) return;
    const nodes = pathKey.split('>').flatMap((id) => nodeById.get(id) ?? []);
    if (nodes.length === 0) return;
    const minX = Math.min(...nodes.map((node) => node.x));
    const minY = Math.min(...nodes.map((node) => node.y));
    const maxX = Math.max(...nodes.map((node) => node.x + node.width));
    const maxY = Math.max(...nodes.map((node) => node.y + node.height));
    const result = fitToContent({ x: minX, y: minY, width: maxX - minX, height: maxY - minY }, effectiveSize, { fallbackFocus: nodes[0] });
    setViewport({ ...result.viewport, scale: Math.max(result.viewport.scale, MIN_SCALE) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- frame only when the path itself changes
  }, [pathKey]);

  // Keep the selected card on screen when selection changes (keyboard, search, URL).
  useEffect(() => {
    if (!selectedId) return;
    const node = nodeById.get(selectedId);
    if (node) setViewport((current) => revealRect(current, node, effectiveSize));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reveal only when the selection itself changes
  }, [selectedId]);

  // Wheel: ctrl/⌘ (and trackpad pinch) zooms at the cursor; otherwise two-finger scroll pans.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if (event.target instanceof Element && event.target.closest('[data-canvas-overlay]')) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      if (event.ctrlKey || event.metaKey) {
        const factor = Math.exp(-event.deltaY * 0.0025);
        setViewport((current) => zoomAt(current, current.scale * factor, event.clientX - rect.left, event.clientY - rect.top));
      } else {
        setViewport((current) => panBy(current, -event.deltaX, -event.deltaY));
      }
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  const zoomStep = (direction: 1 | -1) =>
    setViewport((current) => zoomAt(current, steppedScale(current.scale, direction), effectiveSize.width / 2, effectiveSize.height / 2));

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button, a, input, [data-canvas-overlay]')) return;
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const dx = event.clientX - state.x;
    const dy = event.clientY - state.y;
    if (!state.moved && Math.hypot(dx, dy) < 4) return;
    state.moved = true;
    state.x = event.clientX;
    state.y = event.clientY;
    setViewport((current) => panBy(current, dx, dy));
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    drag.current = null;
    if (state && !state.moved && event.target === event.currentTarget && selectedId) onSelect(null);
  };

  const select = useCallback(
    (personId: string, options?: { openPanel?: boolean }) => {
      onSelect(personId, options);
      focusCard(personId);
    },
    [onSelect, focusCard],
  );

  // Stable identity matters: PersonCard is memoised, and a new callback per frame would
  // re-render every card on every pan.
  const onToggleCollapsed = useCallback((personId: string) => toggleCollapsed(treeId, personId), [toggleCollapsed, treeId]);

  const chooseFromSearch = (personId: string) => {
    const node = nodeById.get(personId);
    setSearchOpen(false);
    setQuery('');
    if (node) setViewport((current) => centreOn({ ...current, scale: Math.max(current.scale, 0.8) }, node, effectiveSize));
    select(personId);
    announce(`Found ${names.get(personId) ?? 'person'}`);
  };

  const openMenuFor = (personId: string, x: number, y: number) => {
    if (!cardMenuItems) return;
    setMenu({ personId, x, y });
  };

  const menuRef = useRef(menu);
  menuRef.current = menu;
  const closeMenu = useCallback(
    (restoreFocus: boolean) => {
      const current = menuRef.current;
      setMenu(null);
      if (current && restoreFocus) focusCard(current.personId);
    },
    [focusCard],
  );

  const onContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    const card = (event.target as HTMLElement).closest<HTMLElement>('[data-person-id]');
    const personId = card?.dataset.personId;
    if (!personId || !cardMenuItems || !containerRef.current) return;
    event.preventDefault();
    const rect = containerRef.current.getBoundingClientRect();
    // Keyboard-initiated context menus report (0, 0): open at the card instead.
    if (event.clientX === 0 && event.clientY === 0 && card) {
      const cardRect = card.getBoundingClientRect();
      openMenuFor(personId, cardRect.left - rect.left + 12, cardRect.bottom - rect.top);
    } else {
      openMenuFor(personId, event.clientX - rect.left, event.clientY - rect.top);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (isEditableTarget(event.target) || event.altKey) return;
    const cardId = (event.target as HTMLElement).dataset.personId;
    if (cardId && cardMenuItems && (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) && containerRef.current) {
      event.preventDefault();
      const rect = containerRef.current.getBoundingClientRect();
      const cardRect = (event.target as HTMLElement).getBoundingClientRect();
      openMenuFor(cardId, cardRect.left - rect.left + 12, cardRect.bottom - rect.top);
      return;
    }
    const withModifier = event.ctrlKey || event.metaKey;
    if (NAV_KEYS.has(event.key) && !withModifier) {
      event.preventDefault();
      const from = selectedId ?? focusId ?? layout.nodes[0]?.personId;
      if (!from) return;
      const next = selectedId ? nextSelection(from, event.key as NavKey, layout.nodes, view.index) : from;
      if (next === selectedId) {
        announce(event.key === 'ArrowUp' ? 'No parents above' : event.key === 'ArrowDown' ? 'No children below' : 'End of this row');
        return;
      }
      select(next);
      return;
    }
    if (withModifier) return;
    switch (event.key) {
      case '+':
      case '=':
        event.preventDefault();
        zoomStep(1);
        break;
      case '-':
      case '_':
        event.preventDefault();
        zoomStep(-1);
        break;
      case 'f':
      case 'F':
        event.preventDefault();
        fit(true);
        break;
      case '/':
        event.preventDefault();
        setSearchOpen(true);
        break;
      case 'Escape':
        if (searchOpen) {
          setSearchOpen(false);
        } else if (selectedId) {
          event.preventDefault();
          onSelect(null);
          announce('Selection cleared');
        }
        break;
      case 'Enter':
        if (selectedId && (event.target as HTMLElement).dataset.personId === selectedId) {
          event.preventDefault();
          onSelect(selectedId, { openPanel: true });
        }
        break;
      default:
        break;
    }
  };

  // Virtualise above 200 people. The visible rectangle is snapped to a grid so panning only
  // re-renders cards when a boundary is crossed.
  const visible = visibleWorldRect(viewport, effectiveSize);
  const grid = 300;
  const snapped = {
    x: Math.floor(visible.x / grid) * grid,
    y: Math.floor(visible.y / grid) * grid,
    width: Math.ceil(visible.width / grid + 1) * grid,
    height: Math.ceil(visible.height / grid + 1) * grid,
  };
  const keep = useMemo(() => new Set([selectedId, focusId].filter((id): id is string => Boolean(id))), [selectedId, focusId]);
  const rendered = useMemo(
    () => visibleNodes(layout.nodes, snapped, keep),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- snapped is recomputed each render; its fields are the real dependencies
    [layout.nodes, snapped.x, snapped.y, snapped.width, snapped.height, keep],
  );
  const tabStop = (selectedId && nodeById.has(selectedId) ? selectedId : null) ?? (focusId && nodeById.has(focusId) ? focusId : null) ?? layout.nodes[0]?.personId ?? null;

  const candidates = useMemo(
    () => graph.people.filter((person) => nodeById.has(person.id)).map((person) => ({ id: person.id, name: names.get(person.id) ?? '', detail: relationToFocus.get(person.id)?.label ?? null })),
    [graph.people, names, relationToFocus, nodeById],
  );
  const branchLabel = useCallback(
    (branch: LayoutBranch) => {
      const surname = branch.personIds.map((id) => people.get(id)?.lastName).find(Boolean);
      return surname ? `${surname} family (married in)` : 'Married-in family';
    },
    [people],
  );

  return (
    // Key events bubble here from the focusable person cards (roving tabindex); pointer handlers
    // implement drag-to-pan, which has keyboard equivalents (arrows, search, Fit).
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- delegated handlers for focusable children
    <div
      ref={containerRef}
      role="region"
      aria-label="Family tree canvas"
      aria-describedby={helpId}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (drag.current = null)}
      onContextMenu={onContextMenu}
      className="relative h-full w-full touch-none select-none overflow-hidden bg-canvas"
      style={{
        // A fixed dot pattern: moving it with the viewport repainted the whole canvas every frame.
        backgroundImage: 'radial-gradient(var(--kf-canvas-grid) 1.2px, transparent 1.2px)',
        backgroundSize: '24px 24px',
        cursor: drag.current?.moved ? 'grabbing' : 'grab',
      }}
    >
      <p id={helpId} className="sr-only">
        Use the arrow keys to move between relatives: up to a parent, down to a child, left and right along a generation. Press Enter to open
        details, Shift+F10 or the Menu key for a person’s actions, slash to search, plus and minus to zoom, F to fit the whole tree, Escape to clear
        the selection.
      </p>

      <div
        className="absolute left-0 top-0 origin-top-left will-change-transform"
        style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})` }}
      >
        <EdgeLayer layout={layout} highlightPairs={highlightPairs} />
        {showBranches ? <BranchBrackets branches={layout.branches} marriedIn={marriedInBranches} labelFor={branchLabel} /> : null}
        {rendered.map((node) => {
          const person = people.get(node.personId);
          if (!person) return null;
          return (
            <PersonCard
              key={node.personId}
              node={node}
              person={person}
              name={names.get(person.id) ?? ''}
              relation={relationToFocus.get(person.id)?.label ?? null}
              isFocus={person.id === focusId}
              isSelected={person.id === selectedId}
              isTabStop={person.id === tabStop}
              dimmed={
                onPath ? !onPath.has(person.id) : Boolean(query.trim()) && !matchesQuery({ name: names.get(person.id) ?? '', detail: relationToFocus.get(person.id)?.label ?? null }, query)
              }
              onSelect={select}
              onToggleCollapsed={onToggleCollapsed}
            />
          );
        })}
      </div>

      <div className="pointer-events-none absolute left-3 right-3 top-3 flex flex-wrap items-start gap-2">
        <div data-canvas-overlay>
          <CanvasToolbar
            scale={viewport.scale}
            canZoomIn={viewport.scale < MAX_SCALE - 0.001}
            canZoomOut={viewport.scale > MIN_SCALE + 0.001}
            onZoomIn={() => zoomStep(1)}
            onZoomOut={() => zoomStep(-1)}
            onReset={() => setViewport((current) => zoomAt(current, 1, effectiveSize.width / 2, effectiveSize.height / 2))}
            onFit={() => fit(true)}
            onSearch={() => setSearchOpen(true)}
            showBranches={showBranches}
            onToggleBranches={() => setShowBranches(!showBranches)}
          />
        </div>
        {searchOpen ? (
          <div data-canvas-overlay>
            <SearchBox
              candidates={candidates}
              query={query}
              onQueryChange={setQuery}
              onChoose={chooseFromSearch}
              onClose={() => {
                setSearchOpen(false);
                setQuery('');
                if (tabStop) focusCard(tabStop);
              }}
            />
          </div>
        ) : null}
      </div>

      {fitNotice ? (
        <p role="status" data-canvas-overlay className="pointer-events-auto absolute bottom-3 left-3 max-w-md rounded-card border border-line bg-surface/95 px-4 py-2 text-sm text-ink shadow-card">
          {fitNotice}
        </p>
      ) : null}

      {menu && cardMenuItems ? (
        <CardMenu anchor={menu} label={`Actions for ${names.get(menu.personId) ?? 'this person'}`} items={cardMenuItems(menu.personId)} onClose={closeMenu} />
      ) : null}

      {graph.people.length > MINIMAP_ABOVE ? (
        <div data-canvas-overlay className="pointer-events-none absolute bottom-3 right-3 hidden sm:block">
          <Minimap
            layout={layout}
            viewport={viewport}
            size={effectiveSize}
            selectedId={selectedId}
            onCentre={(x, y) => setViewport((current) => ({ ...current, x: effectiveSize.width / 2 - x * current.scale, y: effectiveSize.height / 2 - y * current.scale }))}
          />
        </div>
      ) : null}
    </div>
  );
}
