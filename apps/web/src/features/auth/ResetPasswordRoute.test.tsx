import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi, signedOut, testUser } from '../../test/mockApi';
import { renderApp } from '../../test/renderApp';

describe('Choose a new password', () => {
  it('lands signed in on the dashboard after a successful reset, not back on sign in', async () => {
    let signedIn = false;
    mockApi({
      'GET /api/auth/me': (request) => (signedIn ? { body: { user: testUser } } : signedOut(request)),
      'POST /api/auth/refresh': signedOut,
      'GET /api/auth/password/status': () => ({ body: { stage: 'verified' } }),
      'POST /api/auth/password/reset': () => {
        signedIn = true;
        return { body: { stage: 'none' } };
      },
    });
    const user = userEvent.setup();
    const { router } = await renderApp('/forgot-password/reset');
    await user.type(await screen.findByLabelText('New password'), 'a completely new password');
    await user.type(screen.getByLabelText('Confirm new password'), 'a completely new password');
    await user.click(screen.getByRole('button', { name: 'Save new password' }));
    expect(await screen.findByRole('heading', { name: 'Welcome, Asha' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });

  it('sends someone without a verified code back to the right step', async () => {
    mockApi({
      'GET /api/auth/me': signedOut,
      'POST /api/auth/refresh': signedOut,
      'GET /api/auth/password/status': () => ({ body: { stage: 'pending' } }),
    });
    const { router } = await renderApp('/forgot-password/reset');
    expect(await screen.findByRole('heading', { name: 'Enter your code' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/forgot-password/verify');
  });
});
