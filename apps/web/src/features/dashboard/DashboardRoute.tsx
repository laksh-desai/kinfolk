import { useCurrentUser } from '../auth/sessionQuery';

export function Component() {
  const user = useCurrentUser();
  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-screen-xl flex-1 px-4 py-8 sm:px-6">
      <h1 className="page-title">Welcome, {user.firstName}</h1>
      <p className="mt-2 text-lg text-ink-muted">Your family trees will be listed here.</p>
    </main>
  );
}
