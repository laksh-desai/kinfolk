import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import { Icon } from './Icon';

interface FieldShellProps {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  optionalMark?: boolean;
  children: ReactNode;
  className?: string;
}

/** Label above, hint under the label, error directly beneath the control — always in that order. */
export function FieldShell({ id, label, hint, error, optionalMark, children, className }: FieldShellProps) {
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-base font-semibold text-ink">
        {label}
        {/* "Required" is conveyed by aria-required on the control; repeating it here double-announces. */}
        {optionalMark ? <span className="ml-1.5 text-sm font-normal text-ink-muted">optional</span> : null}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
      {children}
      {error ? (
        <p id={`${id}-error`} className="flex items-start gap-1.5 text-sm font-semibold text-danger">
          <Icon name="alert" className="mt-0.5 size-4" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
