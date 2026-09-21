import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BrandFooter, Wordmark } from '../components/Brand';
import { buttonClasses } from '../components/Button';
import { Icon } from '../components/Icon';

export function NotFoundRoute() {
  useEffect(() => {
    document.title = 'Page not found · Kinfolk';
  }, []);
  return (
    <div className="flex min-h-screen flex-col bg-ground">
      <header className="px-4 py-5 sm:px-8">
        <Wordmark size="large" />
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-4 px-4 py-16 text-center"
      >
        <span className="inline-flex size-14 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Icon name="search" className="size-7" />
        </span>
        <h1 className="page-title">We can’t find that page</h1>
        <p className="text-lg text-ink-muted">
          The link may be old, or the family tree it pointed to may have been deleted or shared with
          a different account.
        </p>
        <Link to="/" className={buttonClasses('primary')}>
          Go to your family trees
        </Link>
      </main>
      <BrandFooter className="mt-auto" />
    </div>
  );
}
