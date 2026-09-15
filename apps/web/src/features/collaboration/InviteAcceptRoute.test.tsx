import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../../test/axe';
import { mockApi, signedOut, testUser } from '../../test/mockApi';
import { renderApp } from '../../test/renderApp';

const preview = { invitedBy: 'Asha Rao', treeName: 'Sharma family', personName: 'Kiran Rao', status: 'open' as const };

describe('opening an invitation link (SPEC §5.5)', () => {
  it('explains the invitation before sign-in and comes back to it afterwards', async () => {
    mockApi({
      'GET /api/auth/me': signedOut,
      'GET /api/invitations/tok123': () => ({ body: preview }),
    });
    await renderApp('/invite/tok123');
    expect(await screen.findByRole('heading', { name: 'Asha Rao invited you to Kinfolk' })).toBeInTheDocument();
    expect(screen.getByText('They’re building the family tree “Sharma family” and added you as Kiran Rao.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/signup?returnTo=%2Finvite%2Ftok123');
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login?returnTo=%2Finvite%2Ftok123');
    expect(screen.queryByRole('button', { name: 'Accept invitation' })).not.toBeInTheDocument();
    await expectNoAxeViolations();
  }, 60_000);

  it('accepts when signed in and sends you to your dashboard', async () => {
    const user = userEvent.setup();
    let accepted = false;
    mockApi({
      'GET /api/auth/me': () => ({ body: { user: testUser } }),
      'GET /api/trees': () => ({ body: { trees: [] } }),
      'GET /api/me/inbox': () => ({ body: { accessInvites: [], linkRequests: [], invitations: [], changeRequests: [] } }),
      'GET /api/invitations/tok123': () => ({ body: preview }),
      'POST /api/invitations/tok123/accept': () => {
        accepted = true;
        return { body: { invitation: { id: 'i1' } } };
      },
    });
    const { router } = await renderApp('/invite/tok123');
    expect(await screen.findByText(testUser.email)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Accept invitation' }));
    await waitFor(() => expect(accepted).toBe(true));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  }, 60_000);

  it('says plainly when the link is expired, withdrawn, or not valid', async () => {
    mockApi({
      'GET /api/auth/me': signedOut,
      'GET /api/invitations/expired': () => ({ body: { ...preview, status: 'expired' } }),
      'GET /api/invitations/bad': () => ({ status: 404, body: { error: { code: 'invitation_invalid', message: 'This invitation link isn’t valid. Check that you copied the whole link.' } } }),
    });
    await renderApp('/invite/expired');
    expect(await screen.findByRole('heading', { name: 'This invitation is no longer open' })).toBeInTheDocument();
    expect(screen.getByText('This invitation has expired. Ask Asha Rao to send it again.')).toBeInTheDocument();

    await renderApp('/invite/bad');
    expect(await screen.findByRole('heading', { name: 'This invitation can’t be opened' })).toBeInTheDocument();
    expect(screen.getByText(/isn’t valid/)).toBeInTheDocument();
  }, 60_000);
});
