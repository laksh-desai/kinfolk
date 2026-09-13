import { Icon } from '../components/Icon';
import { IconButton } from '../components/IconButton';
import { cx } from '../lib/cx';
import { Legend } from './Legend';

interface CanvasToolbarProps {
  scale: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onFit: () => void;
  onSearch: () => void;
  showBranches: boolean;
  onToggleBranches: () => void;
}

/** Always-visible canvas controls. Every one has a name, a tooltip, and a keyboard shortcut. */
export function CanvasToolbar(props: CanvasToolbarProps) {
  const percent = Math.round(props.scale * 100);
  return (
    <div
      role="toolbar"
      aria-label="Canvas controls"
      className="pointer-events-auto flex flex-wrap items-center gap-1 rounded-card border border-line bg-surface/95 p-1 shadow-card backdrop-blur"
    >
      <IconButton icon="search" label="Find a person" shortcut="/" onClick={props.onSearch} />
      <span className="mx-1 h-6 w-px bg-line" aria-hidden="true" />
      <IconButton icon="zoom-out" label="Zoom out" shortcut="-" onClick={props.onZoomOut} disabled={!props.canZoomOut} />
      <output aria-label="Zoom level" className="inline-flex min-w-14 justify-center text-base font-semibold tabular-nums text-ink">
        {percent}%
      </output>
      <IconButton icon="zoom-in" label="Zoom in" shortcut="+" onClick={props.onZoomIn} disabled={!props.canZoomIn} />
      <button
        type="button"
        onClick={props.onReset}
        className="inline-flex min-h-11 items-center rounded-control px-2 text-sm font-semibold text-ink hover:bg-sunken"
        aria-label="Reset zoom to 100%"
      >
        100%
      </button>
      <IconButton icon="fit" label="Fit the whole tree on screen" shortcut="F" onClick={props.onFit} />
      <span className="mx-1 h-6 w-px bg-line" aria-hidden="true" />
      <button
        type="button"
        aria-pressed={props.showBranches}
        onClick={props.onToggleBranches}
        className={cx(
          'inline-flex min-h-11 items-center gap-2 rounded-control px-3 text-sm font-semibold',
          props.showBranches ? 'bg-accent-soft text-accent' : 'text-ink hover:bg-sunken',
        )}
      >
        <Icon name="users" className="size-4" />
        Family branches
      </button>
      <Legend />
    </div>
  );
}
