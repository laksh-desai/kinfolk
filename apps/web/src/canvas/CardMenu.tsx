import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useEffect, useId, useRef } from 'react';
import { Icon } from '../components/Icon';
import type { IconName } from '../components/icons';
import { cx } from '../lib/cx';

export type CardMenuItem =
  | {
      label: string;
      icon: IconName;
      onSelect: () => void;
      tone?: 'danger';
      /** The action opens a panel or dialog that takes focus itself, so don't return focus to the card. */
      movesFocus?: boolean;
    }
  | { separator: true; key: string };

interface CardMenuProps {
  /** Screen position inside the canvas container where the menu opens. */
  anchor: { x: number; y: number } | null;
  label: string;
  items: CardMenuItem[];
  /** Called once when the menu closes; `restoreFocus` is false when the chosen action moved focus elsewhere. */
  onClose: (restoreFocus: boolean) => void;
}

const itemClass = 'flex min-h-11 cursor-pointer select-none items-center gap-3 rounded-md px-3 text-base outline-none data-[highlighted]:bg-sunken';

/**
 * A person card's menu: right-click, the Menu key, or Shift+F10. One menu serves the whole canvas;
 * it opens at the pointer (or at the card for the keyboard) and returns focus to the card.
 */
export function CardMenu({ anchor, label, items, onClose }: CardMenuProps) {
  // Whether focus should go back to the card when the menu closes.
  const restoreFocus = useRef(true);
  const labelId = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!anchor) return;
    restoreFocus.current = true;
    // Start on the first action however the menu was opened, so arrow keys and Enter work at once.
    const frame = requestAnimationFrame(() => contentRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus());
    return () => cancelAnimationFrame(frame);
  }, [anchor]);
  return (
    <DropdownMenu.Root
      open={anchor !== null}
      onOpenChange={(open) => {
        if (!open) onClose(restoreFocus.current);
      }}
      modal
    >
      <DropdownMenu.Trigger asChild>
        <span aria-hidden="true" tabIndex={-1} className="pointer-events-none absolute size-px" style={{ left: anchor?.x ?? 0, top: anchor?.y ?? 0 }} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          // Radix names the menu after its trigger, which here is an invisible anchor; name it after the person instead.
          aria-labelledby={labelId}
          align="start"
          sideOffset={4}
          collisionPadding={12}
          ref={contentRef}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
          }}
          onPointerDownOutside={() => {
            // Clicking elsewhere (another card, the panel) puts focus where the user clicked.
            restoreFocus.current = false;
          }}
          className="z-50 min-w-56 max-w-[calc(100vw-1.5rem)] rounded-card border border-line bg-surface p-1.5 shadow-card"
        >
          <DropdownMenu.Label id={labelId} className="truncate px-3 py-1.5 text-sm font-semibold text-ink-muted">{label}</DropdownMenu.Label>
          {items.map((item) =>
            'separator' in item ? (
              <DropdownMenu.Separator key={item.key} className="my-1 h-px bg-line" />
            ) : (
              <DropdownMenu.Item
                key={item.label}
                className={cx(itemClass, item.tone === 'danger' ? 'text-danger' : 'text-ink')}
                onSelect={() => {
                  restoreFocus.current = !item.movesFocus;
                  item.onSelect();
                }}
              >
                <Icon name={item.icon} />
                {item.label}
              </DropdownMenu.Item>
            ),
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
