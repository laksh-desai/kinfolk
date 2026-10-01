import { useRef } from 'react';
import type { IconName } from '../components/icons';
import { Menu, MenuItem, MenuSeparator } from '../components/Menu';

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

/**
 * A person card's menu: right-click, the Menu key, or Shift+F10. One menu serves the whole canvas;
 * it opens at the pointer (or at the card for the keyboard) and returns focus to the card.
 */
export function CardMenu({ anchor, label, items, onClose }: CardMenuProps) {
  // Whether focus should go back to the card when the menu closes.
  const restoreFocus = useRef(true);
  const open = anchor !== null;
  if (open) restoreFocus.current = true;
  return (
    <Menu
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose(restoreFocus.current);
      }}
      modal
      align="start"
      // Start on the first action however the menu was opened, so arrow keys and Enter work at once.
      focusFirstItem
      // The trigger is an invisible anchor at the pointer; the menu is named after the person instead.
      trigger={<span aria-hidden="true" tabIndex={-1} className="pointer-events-none absolute size-px" style={{ left: anchor?.x ?? 0, top: anchor?.y ?? 0 }} />}
      label={label}
      onCloseAutoFocus={(event) => event.preventDefault()}
      onPointerDownOutside={() => {
        // Clicking elsewhere (another card, the panel) puts focus where the user clicked.
        restoreFocus.current = false;
      }}
    >
      {items.map((item) =>
        'separator' in item ? (
          <MenuSeparator key={item.key} />
        ) : (
          <MenuItem
            key={item.label}
            icon={item.icon}
            tone={item.tone === 'danger' ? 'danger' : 'neutral'}
            onSelect={() => {
              restoreFocus.current = !item.movesFocus;
              item.onSelect();
            }}
          >
            {item.label}
          </MenuItem>
        ),
      )}
    </Menu>
  );
}
