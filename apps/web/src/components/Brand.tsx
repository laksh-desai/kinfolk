import { Link } from 'react-router-dom';
import { cx } from '../lib/cx';

/** The company Kinfolk is built for. One place, so it is never spelled two ways. */
export const COMPANY = 'ATS Wealth Management';

/**
 * The ATS tree on its own. Decorative wherever a readable "Kinfolk" sits beside it; give it a
 * `label` on the rare screen where the mark stands alone.
 */
export function BrandMark({ className, label }: { className?: string; label?: string }) {
  return <span {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })} className={cx('brand-mark', className)} />;
}

/** The full ATS lockup: tree, name, and "A Simplicity Company". */
export function BrandLockup({ className }: { className?: string }) {
  return <span role="img" aria-label={COMPANY} className={cx('brand-lockup', className)} />;
}

interface WordmarkProps {
  /** `large` is for screens outside the app shell, where the lockup carries the page. */
  size?: 'default' | 'large';
  /** Renders as plain text instead of a link — for the one screen that is already home. */
  asText?: boolean;
  className?: string;
}

/**
 * "Kinfolk, by ATS Wealth Management": the product name with the company under it, led by the
 * ATS tree. The byline is one line of small caps — present on every screen, never shouting.
 */
export function Wordmark({ size = 'default', asText = false, className }: WordmarkProps) {
  const inner = (
    <>
      <BrandMark className={size === 'large' ? 'h-10' : 'h-8'} />
      <span className="flex min-w-0 flex-col justify-center gap-0.5">
        <span className={cx('font-serif font-semibold leading-none text-ink', size === 'large' ? 'text-2xl' : 'text-xl')}>Kinfolk</span>
        <span className="hidden text-[0.625rem] font-semibold uppercase leading-none tracking-[0.16em] text-ink-faint sm:block">by {COMPANY}</span>
      </span>
    </>
  );
  const classes = cx('inline-flex min-h-11 items-center gap-2.5', className);
  if (asText) return <span className={classes}>{inner}</span>;
  return (
    <Link to="/" className={classes} aria-label={`Kinfolk by ${COMPANY} — home`}>
      {inner}
    </Link>
  );
}

/**
 * The ATS lockup, quietly, at the foot of the screens people outside the firm see: sign-in,
 * an invitation, a shared tree. Inside the app the header wordmark already says it.
 */
export function BrandFooter({ className }: { className?: string }) {
  return (
    <footer className={cx('flex flex-col items-center gap-2 border-t border-line px-4 py-6 text-center', className)}>
      <BrandLockup className="h-9 opacity-90" />
      <p className="text-sm text-ink-faint">Kinfolk is provided by {COMPANY}.</p>
    </footer>
  );
}
