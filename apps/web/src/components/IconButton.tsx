import * as Tooltip from '@radix-ui/react-tooltip';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cx } from '../lib/cx';
import { Icon } from './Icon';
import type { IconName } from './icons';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children'> {
  icon: IconName;
  /** Required: becomes the accessible name and the tooltip. There is no way to render an unnamed icon button. */
  label: string;
  variant?: 'ghost' | 'secondary' | 'primary';
  /** Keyboard shortcut shown in the tooltip, e.g. "F". */
  shortcut?: string;
}

const VARIANTS = {
  ghost: 'text-ink hover:bg-sunken border border-transparent',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-sunken',
  primary: 'bg-accent text-on-accent hover:bg-accent-hover border border-transparent',
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, variant = 'ghost', shortcut, className, type = 'button', ...rest },
  ref,
) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          ref={ref}
          type={type}
          aria-label={label}
          aria-keyshortcuts={shortcut}
          className={cx(
            'inline-flex size-11 items-center justify-center rounded-control transition-colors disabled:opacity-60',
            VARIANTS[variant],
            className,
          )}
          {...rest}
        >
          <Icon name={icon} />
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="bottom"
          sideOffset={6}
          className="z-50 rounded-md bg-ink px-2.5 py-1.5 text-sm font-medium text-ground shadow-card"
        >
          {label}
          {shortcut ? <kbd className="ml-2 rounded border border-ground/40 px-1 font-sans">{shortcut}</kbd> : null}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
});
