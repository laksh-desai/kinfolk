import { ApiError, describeError } from '../lib/api';
import { cx } from '../lib/cx';
import { Button } from './Button';
import { Icon } from './Icon';

interface ErrorStateProps {
  error: unknown;
  title?: string;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
}

/** A failed load: what happened in plain words, and a way to try again. */
export function ErrorState({ error, title, onRetry, retrying, className }: ErrorStateProps) {
  const offline = error instanceof ApiError && error.kind === 'offline';
  return (
    <div role="alert" className={cx('mx-auto flex max-w-lg flex-col items-center gap-3 px-4 py-10 text-center', className)}>
      <span className="inline-flex size-14 items-center justify-center rounded-full bg-danger-soft text-danger">
        <Icon name={offline ? 'wifi-off' : 'alert'} className="size-7" />
      </span>
      <h2 className="text-xl font-semibold">{title ?? (offline ? "You're offline" : "This didn't load")}</h2>
      <p className="text-base text-ink-muted">{describeError(error)}</p>
      {onRetry ? (
        <Button variant="primary" icon="refresh" onClick={onRetry} pending={retrying} pendingLabel="Trying again…">
          Try again
        </Button>
      ) : null}
    </div>
  );
}
