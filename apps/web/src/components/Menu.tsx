import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useEffect, useId, useRef, type ComponentProps, type ReactElement, type ReactNode } from 'react';
import { cx } from '../lib/cx';
import { Icon } from './Icon';
import type { IconName } from './icons';

interface MenuProps {
  /** Opens the menu. It is rendered as the trigger itself (`asChild`), so it must carry its own name. */
  trigger: ReactElement;
  /**
   * The menu's accessible name. Radix would name the menu after its trigger, which is wrong when
   * the trigger is an icon or an invisible anchor, so this is always set; `labelHidden` keeps it
   * for assistive tech only.
   */
  label: string;
  labelHidden?: boolean;
  align?: 'start' | 'end';
  children: ReactNode;
  /** Controlled use (the canvas card menu opens at a pointer position). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  modal?: boolean;
  /** Put focus on the first item as soon as the menu opens, however it was opened. */
  focusFirstItem?: boolean;
  onCloseAutoFocus?: ComponentProps<typeof DropdownMenu.Content>['onCloseAutoFocus'];
  onPointerDownOutside?: ComponentProps<typeof DropdownMenu.Content>['onPointerDownOutside'];
}

/**
 * The one dropdown menu: a Radix menu with the app's skin, named by its label (never by the
 * trigger), collision-aware, and never wider than the window. Items are `MenuItem`s.
 */
export function Menu({ trigger, label, labelHidden = false, align = 'end', children, open, onOpenChange, modal, focusFirstItem = false, onCloseAutoFocus, onPointerDownOutside }: MenuProps) {
  const labelId = useId();
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focusFirstItem || !open) return;
    const frame = requestAnimationFrame(() => contentRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus());
    return () => cancelAnimationFrame(frame);
  }, [focusFirstItem, open]);

  return (
    <DropdownMenu.Root {...(open === undefined ? {} : { open })} {...(onOpenChange ? { onOpenChange } : {})} {...(modal === undefined ? {} : { modal })}>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          ref={contentRef}
          aria-labelledby={labelId}
          align={align}
          sideOffset={6}
          collisionPadding={12}
          onCloseAutoFocus={onCloseAutoFocus}
          onPointerDownOutside={onPointerDownOutside}
          className="z-50 min-w-56 max-w-[calc(100vw-1.5rem)] rounded-card border border-line bg-surface p-1.5 shadow-card"
        >
          <DropdownMenu.Label id={labelId} className={cx('truncate px-3 py-1.5 text-sm font-semibold text-ink-muted', labelHidden && 'sr-only')}>
            {label}
          </DropdownMenu.Label>
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

interface MenuItemProps extends Omit<ComponentProps<typeof DropdownMenu.Item>, 'className'> {
  icon?: IconName;
  tone?: 'neutral' | 'danger';
  className?: string;
}

export function MenuItem({ icon, tone = 'neutral', className, children, ...rest }: MenuItemProps) {
  return (
    <DropdownMenu.Item
      className={cx(
        'flex min-h-11 cursor-pointer select-none items-center gap-3 rounded-md px-3 text-base outline-none data-[highlighted]:bg-sunken',
        tone === 'danger' ? 'text-danger' : 'text-ink',
        className,
      )}
      {...rest}
    >
      {icon ? <Icon name={icon} /> : null}
      {children}
    </DropdownMenu.Item>
  );
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="my-1 h-px bg-line" />;
}

/** Free text inside a menu — a note under the items, or who is signed in. */
export function MenuNote({ children }: { children: ReactNode }) {
  return <div className="px-3 py-1.5 text-sm text-ink-muted">{children}</div>;
}
