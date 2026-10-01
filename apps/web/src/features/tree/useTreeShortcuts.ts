import { useEffect } from 'react';
import { useCanvasStore } from '../../canvas/useCanvasStore';
import { isEditableTarget } from '../../lib/isEditableTarget';

/**
 * The single-key shortcuts that belong to the whole tree page, not to the canvas: `/` finds a
 * person and `?` lists the shortcuts. Window-level, like undo, so they work after the header,
 * the panel, or the list has had focus — but never while typing, and never under a dialog,
 * which owns the keyboard while it is open.
 */
export function useTreeShortcuts(): void {
  const setSearchOpen = useCanvasStore((state) => state.setSearchOpen);
  const setHelpOpen = useCanvasStore((state) => state.setHelpOpen);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isEditableTarget(event.target)) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (event.key === '/') {
        event.preventDefault();
        setSearchOpen(true);
      } else if (event.key === '?') {
        event.preventDefault();
        setHelpOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setSearchOpen, setHelpOpen]);
}
