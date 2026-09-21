import { useQuery } from '@tanstack/react-query';
import { buttonClasses } from '../../components/Button';
import { authApi } from './authApi';

/**
 * A plain link to the API's OAuth start route — no Google SDK is loaded in the browser. In
 * development without Google credentials the same route shows a stand-in consent form.
 */
export function GoogleButton({ returnTo }: { returnTo: string }) {
  const providers = useQuery({
    queryKey: ['auth-providers'],
    queryFn: authApi.providers,
    staleTime: Infinity,
  });
  const href = `/api/auth/oauth/google/start?${new URLSearchParams({ returnTo })}`;
  const mode = providers.data?.google.mode;
  const devMode = mode === 'dev';
  // Nothing to link to when the deployment has no Google sign-in at all (ADR 036), and nothing
  // until we know, so the button never flashes up and vanishes. The divider goes with it.
  if (mode === undefined || mode === 'off') return null;
  return (
    <>
      <a href={href} className={buttonClasses('secondary', 'w-full')}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5">
          <path
            fill="#4285F4"
            d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7Z"
          />
          <path
            fill="#34A853"
            d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z"
          />
          <path
            fill="#FBBC05"
            d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1Z"
          />
          <path
            fill="#EA4335"
            d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.8 3.6-4.9 6.7-4.9Z"
          />
        </svg>
        Continue with Google{devMode ? ' (development sign-in)' : ''}
      </a>
      <div className="flex items-center gap-3 text-sm text-ink-muted" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />
        or with email
        <span className="h-px flex-1 bg-line" />
      </div>
    </>
  );
}
