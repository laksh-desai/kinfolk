/**
 * Shown only while the root loader resolves the session on first load: no login form, no app
 * chrome, so neither can flash for the wrong person.
 */
export function SplashScreen() {
  return (
    <div role="status" aria-busy="true" className="flex min-h-screen items-center justify-center bg-ground">
      <span className="sr-only">Opening Kinfolk</span>
      <svg aria-hidden="true" viewBox="0 0 32 32" className="size-12 animate-pulse text-accent">
        <rect width="32" height="32" rx="7" fill="currentColor" />
        <path
          d="M16 7v6m0 0-6 5m6-5 6 5M10 18v5m12-5v5"
          stroke="var(--kf-surface)"
          strokeWidth="2.4"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </div>
  );
}
