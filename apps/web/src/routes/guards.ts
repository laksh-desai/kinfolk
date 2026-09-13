import { redirect, type LoaderFunctionArgs } from 'react-router-dom';
import { sessionQuery } from '../features/auth/sessionQuery';
import { queryClient } from '../lib/queryClient';

/** Only same-site relative paths survive; anything else returns home. */
export function safeReturnTo(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/';
  return value;
}

export async function rootLoader() {
  return queryClient.ensureQueryData(sessionQuery);
}

/** Runs before any protected route renders, so a signed-out visitor never sees app chrome. */
export async function requireUserLoader({ request }: LoaderFunctionArgs) {
  const user = await queryClient.ensureQueryData(sessionQuery);
  if (!user) {
    const url = new URL(request.url);
    const returnTo = `${url.pathname}${url.search}`;
    throw redirect(returnTo === '/' ? '/login' : `/login?${new URLSearchParams({ returnTo })}`);
  }
  return user;
}

/** Runs before sign-in screens render, so a signed-in user never sees the login form flash. */
export async function redirectIfSignedInLoader({ request }: LoaderFunctionArgs) {
  const user = await queryClient.ensureQueryData(sessionQuery);
  if (user) throw redirect(safeReturnTo(new URL(request.url).searchParams.get('returnTo')));
  return null;
}
