import type { ReactNode } from 'react';
import { BrandFooter, Wordmark } from '../../components/Brand';

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
<Wordmark size="large" />
      </header>
      <main id="main" tabIndex={-1} className="flex flex-1 items-start justify-center px-4 pb-16 pt-4 sm:pt-10">
        <div className="w-full max-w-md">
          <h1 className="page-title">{title}</h1>
          {intro ? <div className="mt-2 text-lg text-ink-muted">{intro}</div> : null}
          <div className="mt-6 rounded-card border border-line bg-surface p-5 shadow-card sm:p-7">{children}</div>
          {footer ? <div className="mt-6 text-center text-base text-ink-muted">{footer}</div> : null}
        </div>
      </main>
      <BrandFooter className="mt-auto" />
    </div>
  );
}
