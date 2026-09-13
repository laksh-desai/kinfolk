import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cx } from '../lib/cx';
import { Icon } from './Icon';
import type { IconName } from './icons';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-quiet';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover border border-transparent',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-sunken',
  ghost: 'bg-transparent text-ink border border-transparent hover:bg-sunken',
  danger: 'bg-danger text-on-danger border border-transparent hover:opacity-90',
  'danger-quiet': 'bg-transparent text-danger border border-danger/50 hover:bg-danger-soft',
};

export const buttonClasses = (variant: ButtonVariant = 'secondary', extra?: string) =>
  cx(
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4 py-2 text-base font-semibold',
    'transition-colors duration-150 disabled:cursor-not-allowed aria-disabled:cursor-not-allowed aria-disabled:opacity-70',
    VARIANTS[variant],
    extra,
  );

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: IconName;
  /** Shows the pending label and ignores further clicks without removing focus. */
  pending?: boolean;
  pendingLabel?: string;
  children: ReactNode;
}

/**
 * Buttons stay focusable while busy (aria-disabled, not disabled) so keyboard users don't lose
 * their place, and the label always changes so a click never looks like it did nothing.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', icon, pending = false, pendingLabel, className, children, onClick, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClasses(variant, className)}
      aria-disabled={pending || rest['aria-disabled'] ? true : undefined}
      aria-busy={pending || undefined}
      onClick={(event) => {
        if (pending) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      {...rest}
    >
      {icon ? <Icon name={icon} /> : null}
      <span>{pending && pendingLabel ? pendingLabel : children}</span>
    </button>
  );
});
