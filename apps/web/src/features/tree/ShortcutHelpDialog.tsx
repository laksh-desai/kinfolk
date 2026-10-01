import { SHORTCUTS } from '../../canvas/shortcuts';
import { useCanvasStore } from '../../canvas/useCanvasStore';
import { Dialog } from '../../components/Dialog';

/** The shortcut list for sighted users, opened with "?" or from the Tools menu. */
export function ShortcutHelpDialog() {
  const open = useCanvasStore((state) => state.helpOpen);
  const setOpen = useCanvasStore((state) => state.setHelpOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen} title="Keyboard shortcuts" description="Everything on the tree page can be done from the keyboard." size="sm">
      <dl className="flex flex-col gap-3 px-5 py-4">
        {SHORTCUTS.map((shortcut) => (
          <div key={shortcut.label} className="flex items-start gap-4">
            <dt className="flex w-32 shrink-0 flex-wrap gap-1">
              {shortcut.keys.map((key) => (
                <kbd key={key} className="rounded-control border border-line-strong bg-sunken px-2 py-0.5 font-sans text-sm font-semibold text-ink">
                  {key}
                </kbd>
              ))}
            </dt>
            <dd className="text-base text-ink">{shortcut.label}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
