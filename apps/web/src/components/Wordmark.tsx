import { Link } from 'react-router-dom';

/** The product name, linking home. Used on screens outside the app shell. */
export function Wordmark() {
  return (
    <Link to="/" className="inline-flex min-h-11 items-center gap-2 font-serif text-xl font-semibold text-ink">
      <svg aria-hidden="true" viewBox="0 0 32 32" className="size-7 text-accent">
        <rect width="32" height="32" rx="7" fill="currentColor" />
        <path d="M16 7v6m0 0-6 5m6-5 6 5M10 18v5m12-5v5" stroke="var(--kf-surface)" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      </svg>
      Kinfolk
    </Link>
  );
}
