import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom';
import { buttonClasses } from '../components/Button';
import { Icon } from '../components/Icon';
import { ApiError } from '../lib/api';
import { NotFoundRoute } from './NotFoundRoute';

/** Error boundary for every route: a plain explanation and two ways forward, never a stack trace. */
export function RouteErrorBoundary() {
  const error = useRouteError();

  if ((isRouteErrorResponse(error) && error.status === 404) || (error instanceof ApiError && error.status === 404)) {
    return <NotFoundRoute />;
  }

  const offline = error instanceof ApiError && error.kind === 'offline';
  const message =
    error instanceof ApiError
      ? error.message
      : 'Something unexpected happened on this page. Your saved work is safe.';

  return (
    <main id="main" tabIndex={-1} className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <span className="inline-flex size-14 items-center justify-center rounded-full bg-danger-soft text-danger">
        <Icon name={offline ? 'wifi-off' : 'alert'} className="size-7" />
      </span>
      <h1 className="page-title">{offline ? "You're offline" : 'This page ran into a problem'}</h1>
      <p role="alert" className="text-lg text-ink-muted">
        {message}
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" className={buttonClasses('primary')} onClick={() => window.location.reload()}>
          <Icon name="refresh" />
          Reload this page
        </button>
        <Link to="/" className={buttonClasses('secondary')}>
          Go to your family trees
        </Link>
      </div>
    </main>
  );
}
