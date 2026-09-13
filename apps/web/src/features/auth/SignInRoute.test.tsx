import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../../test/axe';
import { mockApi, signedOut, testUser } from '../../test/mockApi';
import { renderApp } from '../../test/renderApp';

const signedOutRoutes = {
  'GET /api/auth/me': signedOut,
  'POST /api/auth/refresh': signedOut,
  'GET /api/auth/providers': () => ({ body: { google: { mode: 'dev' } } }),
};

describe('Sign in', () => {
  it('focuses and announces the first invalid field when submitted empty', async () => {
    mockApi(signedOutRoutes);
    const user = userEvent.setup();
    await renderApp('/login');
    await user.click(await screen.findByRole('button', { name: 'Sign in' }));

    const email = screen.getByLabelText('Email');
    expect(email).toHaveFocus();
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAccessibleDescription('Enter your email address.');
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription('Enter your password.');
    await waitFor(() =>
      expect(screen.getByTestId('live-assertive')).toHaveTextContent(
        '2 fields need attention. Email: Enter your email address. Password: Enter your password.',
      ),
    );
  });

  it('shows and focuses a server rejection instead of doing nothing', async () => {
    mockApi({
      ...signedOutRoutes,
      'POST /api/auth/login': () => ({
        status: 401,
        body: { error: { code: 'invalid_credentials', message: "That email and password don't match an account." } },
      }),
    });
    const user = userEvent.setup();
    await renderApp('/login');
    await user.type(await screen.findByLabelText('Email'), 'asha@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    const alert = await screen.findByText("That email and password don't match an account.");
    await waitFor(() => expect(alert.parentElement).toHaveFocus());
  });

  it('signs in and returns to the page the person was trying to reach', async () => {
    const api = mockApi({
      ...signedOutRoutes,
      'POST /api/auth/login': () => ({ body: { user: testUser } }),
      'GET /api/account/deletion-summary': () => ({ body: { email: testUser.email, ownedTrees: [], sharedTreeCount: 0 } }),
    });
    const user = userEvent.setup();
    const { router } = await renderApp('/login?returnTo=%2Faccount');
    await user.type(await screen.findByLabelText('Email'), 'Asha@Example.com');
    await user.type(screen.getByLabelText('Password'), 'long enough password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Account' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/account');
    const login = api.calls.find((call) => call.path === '/api/auth/login');
    expect(login?.body).toEqual({ email: 'asha@example.com', password: 'long enough password' });
    expect(login?.headers['x-csrf-token']).toBe('test-csrf');
  });

  it('has no axe violations and names the Google and password-visibility controls', async () => {
    mockApi(signedOutRoutes);
    await renderApp('/login');
    await screen.findByRole('button', { name: 'Sign in' });
    expect(screen.getByRole('button', { name: 'Show password' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /Continue with Google/ })).toHaveAttribute(
      'href',
      '/api/auth/oauth/google/start?returnTo=%2F',
    );
    await expectNoAxeViolations();
  });
});
