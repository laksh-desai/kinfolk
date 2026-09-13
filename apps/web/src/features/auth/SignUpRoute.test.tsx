import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../../test/axe';
import { mockApi, signedOut } from '../../test/mockApi';
import { renderApp } from '../../test/renderApp';

const signedOutRoutes = {
  'GET /api/auth/me': signedOut,
  'POST /api/auth/refresh': signedOut,
  'GET /api/auth/providers': () => ({ body: { google: { mode: 'google' } } }),
};

describe('Create account', () => {
  it('validates a field on blur once the person has typed', async () => {
    mockApi(signedOutRoutes);
    const user = userEvent.setup();
    await renderApp('/signup');
    const email = await screen.findByLabelText('Email');
    await user.type(email, 'not-an-email');
    await user.tab();
    expect(email).toHaveAccessibleDescription('Enter an email address like name@example.com.');
    await user.clear(email);
    await user.type(email, 'asha@example.com');
    expect(email).not.toHaveAttribute('aria-invalid');
  });

  it('focuses first name when every field is empty', async () => {
    mockApi(signedOutRoutes);
    const user = userEvent.setup();
    await renderApp('/signup');
    await user.click(await screen.findByRole('button', { name: 'Create account' }));
    expect(screen.getByLabelText('First name')).toHaveFocus();
    await waitFor(() => expect(screen.getByTestId('live-assertive')).toHaveTextContent(/4 fields need attention/));
  });

  it('puts a server field error beside the field it belongs to', async () => {
    mockApi({
      ...signedOutRoutes,
      'POST /api/auth/signup': () => ({
        status: 409,
        body: {
          error: {
            code: 'email_taken',
            message: 'An account with this email already exists. Sign in instead.',
            fields: { email: 'An account with this email already exists. Sign in instead.' },
          },
        },
      }),
    });
    const user = userEvent.setup();
    await renderApp('/signup');
    await user.type(await screen.findByLabelText('First name'), 'Asha');
    await user.type(screen.getByLabelText('Last name'), 'Rao');
    await user.type(screen.getByLabelText('Email'), 'asha@example.com');
    await user.type(screen.getByLabelText('Password'), 'long enough password');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    const email = screen.getByLabelText('Email');
    await waitFor(() => expect(email).toHaveFocus());
    expect(email).toHaveAccessibleDescription('An account with this email already exists. Sign in instead.');
  });

  it('has no axe violations', async () => {
    mockApi(signedOutRoutes);
    await renderApp('/signup');
    await screen.findByRole('button', { name: 'Create account' });
    await expectNoAxeViolations();
  });
});
