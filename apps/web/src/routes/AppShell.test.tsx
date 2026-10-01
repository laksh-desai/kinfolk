import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../test/axe';
import { mockApi, signedOut, testUser } from '../test/mockApi';
import { renderApp } from '../test/renderApp';
import { api } from '../lib/api';

describe('AppShell', () => {
  it('when the session expires mid-use, goes to sign in (keeping the page to return to) without an error screen', async () => {
    mockApi({
      'GET /api/auth/me': () => ({ body: { user: testUser } }),
      'GET /api/something': signedOut,
      'POST /api/auth/refresh': signedOut,
      'GET /api/auth/providers': () => ({ body: { google: { mode: 'dev' } } }),
    });
    const { router } = await renderApp('/account');
    await screen.findByRole('heading', { level: 1, name: 'Account' });

    let sawErrorScreen = false;
    const observer = new MutationObserver(() => {
      if (document.body.textContent?.includes('This page ran into a problem')) sawErrorScreen = true;
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    // React can recover from a render throw before painting, so also watch for the throw itself.
    const renderErrors: string[] = [];
    const onError = (event: ErrorEvent) => renderErrors.push(String(event.error?.message ?? event.message));
    window.addEventListener('error', onError);
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await api('/api/something').catch(() => undefined);
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    observer.disconnect();
    window.removeEventListener('error', onError);
    quiet.mockRestore();
    expect(router.state.location.search).toBe('?returnTo=%2Faccount');
    expect(sawErrorScreen).toBe(false);
    expect(renderErrors).toEqual([]);
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('switches the theme from the account menu, and the account page agrees', async () => {
    mockApi({
      'GET /api/auth/me': () => ({ body: { user: testUser } }),
      'GET /api/auth/providers': () => ({ body: { google: { mode: 'dev' } } }),
    });
    const user = userEvent.setup();
    await renderApp('/account');
    await screen.findByRole('heading', { level: 1, name: 'Account' });
    // Dark is the default, so the menu offers light.
    await user.click(screen.getByRole('button', { name: 'Account menu for Asha Rao' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Switch to light theme' }));
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'));
    expect(screen.getByRole('radio', { name: /^Light/ })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Account menu for Asha Rao' }));
    expect(await screen.findByRole('menuitem', { name: 'Switch to dark theme' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    // Back to the default, so the next test starts where every other one does.
    await user.click(screen.getByRole('radio', { name: /^Dark/ }));
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
  });

  it('signs out straight to the sign-in page without flashing an error screen', async () => {
    let signedIn = true;
    mockApi({
      'GET /api/auth/me': (request) => (signedIn ? { body: { user: testUser } } : signedOut(request)),
      'POST /api/auth/refresh': signedOut,
      'POST /api/auth/logout': () => {
        signedIn = false;
        return { status: 204 };
      },
      'GET /api/auth/providers': () => ({ body: { google: { mode: 'dev' } } }),
    });
    const user = userEvent.setup();
    const { router } = await renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'Account menu for Asha Rao' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));

    const sawErrorScreen = { value: false };
    const observer = new MutationObserver(() => {
      if (document.body.textContent?.includes('This page ran into a problem')) sawErrorScreen.value = true;
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    observer.disconnect();
    expect(sawErrorScreen.value).toBe(false);
  });

  it('offers a skip link, a named main navigation, and a named account menu; axe-clean', async () => {
    mockApi({ 'GET /api/auth/me': () => ({ body: { user: testUser } }) });
    await renderApp('/');
    expect(await screen.findByRole('link', { name: 'Skip to main content' })).toHaveAttribute('href', '#main');
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Account menu for Asha Rao' })).toBeInTheDocument();
    await expectNoAxeViolations();
  });
});
