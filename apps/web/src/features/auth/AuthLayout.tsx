import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface AuthLayoutProps {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthLayout({ title, intro, children, footer }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-ground">
      <header className="px-4 py-5 sm:px-8">
        <Link to="/" className="inline-flex min-h-11 items-center gap-2 font-serif text-2xl font-semibold text-ink">
          <svg aria-hidden="true" viewBox="0 0 32 32" className="size-8 text-accent">
            <rect width="32" height="32" rx="7" fill="currentColor" />
            <path d="M16 7v6m0 0-6 5m6-5 6 5M10 18v5m12-5v5" stroke="var(--kf-surface)" strokeWidth="2.4" strokeLinecap="round" fill="none" />
          </svg>
          Kinfolk
        </Link>
      </header>
      <main id="main" tabIndex={-1} className="flex flex-1 items-start justify-center px-4 pb-16 pt-4 sm:pt-10">
        <div className="w-full max-w-md">
          <h1 className="page-title">{title}</h1>
          {intro ? <div className="mt-2 text-lg text-ink-muted">{intro}</div> : null}
          <div className="mt-6 rounded-card border border-line bg-surface p-5 shadow-card sm:p-7">{children}</div>
          {footer ? <div className="mt-6 text-center text-base text-ink-muted">{footer}</div> : null}
        </div>
      </main>
    </div>
  );
}
