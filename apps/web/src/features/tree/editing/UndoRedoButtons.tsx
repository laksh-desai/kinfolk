import { useEffect } from 'react';
import { IconButton } from '../../../components/IconButton';
import { isEditableTarget } from '../../../lib/isEditableTarget';
import { redoLast, undoLast } from './changeQueue';
import { useTreeEditingState } from './editingStore';

/** Undo and redo, named with what they will do, plus ⌘Z / ⌘⇧Z (Ctrl+Z / Ctrl+Y on Windows). */
export function UndoRedoButtons({ treeId }: { treeId: string }) {
  const { undo, redo } = useTreeEditingState(treeId);
  const nextUndo = undo[undo.length - 1];
  const nextRedo = redo[redo.length - 1];

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || isEditableTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        void undoLast(treeId)?.catch(() => undefined);
      } else if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault();
        void redoLast(treeId)?.catch(() => undefined);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [treeId]);

  return (
    <div className="flex items-center gap-1">
      <IconButton
        icon="undo"
        label={nextUndo ? `Undo: ${nextUndo.label}` : 'Undo (nothing to undo)'}
        shortcut="⌘Z"
        disabled={!nextUndo}
        onClick={() => void undoLast(treeId)?.catch(() => undefined)}
      />
      <IconButton
        icon="redo"
        label={nextRedo ? `Redo: ${nextRedo.label}` : 'Redo (nothing to redo)'}
        shortcut="⌘⇧Z"
        disabled={!nextRedo}
        onClick={() => void redoLast(treeId)?.catch(() => undefined)}
      />
    </div>
  );
}
