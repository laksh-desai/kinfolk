import * as RadixDialog from '@radix-ui/react-dialog';
import { useRef, type ReactNode } from 'react';
import { cx } from '../lib/cx';
import { Icon } from './Icon';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const WIDTHS = { sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-3xl' };
const FORM_FIELD = 'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])';
const FOCUSABLE ='input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/**
 * The one dialog.
 * - Width is min(viewport − gutter, size cap); content scrolls vertically only, and every
 *   descendant may shrink (min-w-0), so no control is pushed off the right edge. Below 640px
 *   it becomes a full-screen sheet.
 * - On open, focus goes to the first control in the body. With none, it goes to the first
 *   footer button (Cancel, for confirmations), never the close button.
 * - Radix traps focus and restores it on close.
 */
export function Dialog({ open, onOpenChange, title, description, children, footer, size = 'md' }: DialogProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <RadixDialog.Content
          onOpenAutoFocus={(event) => {
            const target =
              bodyRef.current?.querySelector<HTMLElement>(FORM_FIELD) ??
              footerRef.current?.querySelector<HTMLElement>(FOCUSABLE) ??
              bodyRef.current?.querySelector<HTMLElement>(FOCUSABLE);
            if (target) {
              event.preventDefault();
              target.focus();
            }
          }}
          className={cx(
            'fixed z-50 flex flex-col bg-surface text-ink shadow-card',
            'inset-0 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2',
            'w-full sm:w-[calc(100vw-2rem)] sm:max-h-[calc(100vh-4rem)] sm:rounded-card sm:border sm:border-line',
            WIDTHS[size],
          )}
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <div className="flex min-w-0 items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <RadixDialog.Title className="text-xl font-semibold">{title}</RadixDialog.Title>
              {description ? (
                <RadixDialog.Description className="mt-1 text-base text-ink-muted">{description}</RadixDialog.Description>
              ) : null}
            </div>
            <RadixDialog.Close
              aria-label="Close"
              className="-mr-2 -mt-1 inline-flex size-11 shrink-0 items-center justify-center rounded-control text-ink hover:bg-sunken"
            >
              <Icon name="x" />
            </RadixDialog.Close>
          </div>
          <div ref={bodyRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-4 [&_*]:min-w-0">
            {children}
          </div>
          {footer ? (
            <div ref={footerRef} className="flex flex-wrap items-center justify-end gap-3 border-t border-line px-5 py-4">
              {footer}
            </div>
          ) : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
