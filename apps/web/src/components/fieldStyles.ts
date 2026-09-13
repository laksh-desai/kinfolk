import { cx } from '../lib/cx';

export const inputClasses = (invalid: boolean, extra?: string) =>
  cx(
    'block w-full min-h-11 rounded-control border bg-surface px-3 py-2 text-base text-ink',
    'focus-visible:outline-3 focus-visible:outline-offset-1',
    invalid ? 'border-danger border-2' : 'border-line-strong',
    extra,
  );

export function describedBy(id: string, hint: unknown, error: unknown): string | undefined {
  return [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
}
