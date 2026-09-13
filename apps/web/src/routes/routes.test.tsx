import { screen, waitFor } from '@testing-library/react';
import type { RouteObject } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { mockApi, signedOut, testUser } from '../test/mockApi';
import { renderApp } from '../test/renderApp';
import { safeReturnTo } from './guards';
import type { RouteHandle } from './routeHandle';
import { routes } from './routes';

function leafRoutes(list: RouteObject[], trail: string[] = []): Array<{ path: string; route: RouteObject }> {
  return list.flatMap((route) => {
    const path = [...trail, route.path ?? (route.index ? '(index)' : '')].filter(Boolean);
    if (route.children?.length) return leafRoutes(route.children, path);
    return [{ path: path.join('/') || '/', route }];
  });
}

describe('route table', () => {
  it('gives every page its own title', () => {
    const leaves = leafRoutes(routes);
    expect(leaves.length).toBeGreaterThan(5);
    const titles = leaves.map(({ path, route }) => {
      const title = (route.handle as RouteHandle | undefined)?.title;
      expect(title, `route ${path} has no title`).toBeTruthy();
      return title;
    });
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('ships no example, test, or placeholder routes', () => {
    const paths = leafRoutes(routes).map(({ path }) => path.toLowerCase());
    for (const banned of ['new', 'example', 'demo', 'test', 'coming-soon', 'playground']) {
      expect(paths.some((path) => path.split('/').includes(banned))).toBe(false);
    }
  });
});

describe('guards', () => {
  it('sends a signed-out visitor to sign in, remembering where they were going, without rendering app chrome', async () => {
    mockApi({ 'GET /api/auth/me': signedOut, 'POST /api/auth/refresh': signedOut, 'GET /api/auth/providers': () => ({ body: { google: { mode: 'dev' } } }) });
    const { router } = await renderApp('/account');
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toBe('?returnTo=%2Faccount');
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Sign in · Kinfolk'));
  });

  it('sends a signed-in user away from the sign-in page without showing the form', async () => {
    mockApi({ 'GET /api/auth/me': () => ({ body: { user: testUser } }) });
    const { router } = await renderApp('/login');
    expect(await screen.findByRole('heading', { name: 'Welcome, Asha' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument();
  });

  it('restores a protected page directly from its URL', async () => {
    mockApi({
      'GET /api/auth/me': () => ({ body: { user: testUser } }),
      'GET /api/account/deletion-summary': () => ({ body: { email: testUser.email, ownedTrees: [], sharedTreeCount: 0 } }),
    });
    await renderApp('/account');
    expect(await screen.findByRole('heading', { level: 1, name: 'Account' })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Account · Kinfolk'));
  });

  it('shows a helpful not-found page with a way home for an unknown URL', async () => {
    mockApi({ 'GET /api/auth/me': signedOut, 'POST /api/auth/refresh': signedOut });
    await renderApp('/new');
    expect(await screen.findByRole('heading', { name: 'We can’t find that page' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to your family trees' })).toHaveAttribute('href', '/');
  });

  it('only honours same-site return paths', () => {
    expect(safeReturnTo('/trees/abc?person=1')).toBe('/trees/abc?person=1');
    expect(safeReturnTo('//evil.example')).toBe('/');
    expect(safeReturnTo('https://evil.example')).toBe('/');
    expect(safeReturnTo(null)).toBe('/');
  });
});
