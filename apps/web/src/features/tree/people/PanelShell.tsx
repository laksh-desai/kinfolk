import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../../../components/Icon';
import { IconButton } from '../../../components/IconButton';
import { cx } from '../../../lib/cx';

interface PanelShellProps {
  title: string;
  subtitle?: ReactNode;
  /** Where the back link goes, e.g. the person's details. */
  back?: { to: string; label: string };
  /** Where closing the panel goes (normally the whole tree). */
  closeTo: string;
  closeLabel: string;
  children: ReactNode;
  footer?: ReactNode;
  leading?: ReactNode;
  wide?: boolean;
  /**
   * Focus moves to the heading whenever this value changes (default: the title, so sub-screens
   * opened on purpose take focus). Null leaves focus where it is, e.g. while arrowing on the canvas.
   */
  focusKey?: string | null;
  headingRef?: RefObject<HTMLHeadingElement>;
}

/**
 * The panel docked beside the canvas. Every person screen (details, add, edit, relationships,
 * merge, compare) uses it, so the canvas keeps its position while the user works. Below the md
 * breakpoint it becomes a full-screen sheet.
 */
export function PanelShell({ title, subtitle, back, closeTo, closeLabel, children, footer, leading, wide, focusKey = title, headingRef }: PanelShellProps) {
  const headingId = useId();
  const ownRef = useRef<HTMLHeadingElement>(null);
  const ref = headingRef ?? ownRef;
  const navigate = useNavigate();

  useEffect(() => {
    if (focusKey !== null) ref.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- focus only when the key changes
  }, [focusKey]);

  return (
    // Escape from anywhere inside the panel goes back a step; the handler is delegated from its controls.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- delegated keyboard handler for focusable children
    <aside
      aria-labelledby={headingId}
      className={cx(
        'fixed inset-0 z-30 flex flex-col bg-surface md:static md:z-auto md:shrink-0 md:border-l md:border-line',
        wide ? 'md:w-[30rem]' : 'md:w-[24rem]',
      )}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.defaultPrevented && !(event.target as HTMLElement).closest('[role="dialog"], [role="menu"], [role="listbox"]')) {
          event.preventDefault();
          navigate(back?.to ?? closeTo);
        }
      }}
    >
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex min-w-0 flex-col gap-1">
          {back ? (
            <Link to={back.to} className="inline-flex min-h-8 items-center gap-1 self-start text-sm font-semibold text-accent underline-offset-2 hover:underline">
              <Icon name="arrow-left" className="size-4" />
              {back.label}
            </Link>
          ) : null}
          <div className="flex min-w-0 items-center gap-3">
            {leading}
            <div className="min-w-0">
              <h2 id={headingId} ref={ref} tabIndex={-1} className="break-words text-xl font-semibold outline-none">
                {title}
              </h2>
              {subtitle ? <p className="text-base text-ink-muted">{subtitle}</p> : null}
            </div>
          </div>
        </div>
        <IconButton icon="x" label={closeLabel} onClick={() => navigate(closeTo)} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      {footer ? <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-4">{footer}</div> : null}
    </aside>
  );
}
