import type { InvitationDto } from '@kinfolk/shared/schemas/collaboration';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../../test/axe';
import { renderApp } from '../../test/renderApp';
import { TREE_ID } from '../../test/treeFixtures';
import { mockTreeServer } from '../../test/treeServer';

const invitation = (overrides: Partial<InvitationDto> = {}): InvitationDto => ({
  id: 'i1',
  personId: '',
  email: 'kiran@example.com',
  stage: 'sent',
  sentAt: '2026-09-10T09:00:00.000Z',
  joinedAt: null,
  treeCreatedAt: null,
  linkedAt: null,
  expiresAt: '2026-10-10T09:00:00.000Z',
  revokedAt: null,
  ...overrides,
});

describe('inviting a relative (SPEC §5.5)', () => {
  it('sends an invitation from the person’s card', async () => {
    const user = userEvent.setup();
    const server = mockTreeServer();
    const kiran = server.seed.people.kiran.id;
    let sent: unknown = null;
    server.api.set(`POST /api/trees/${TREE_ID}/invitations`, (request) => {
      sent = request.body;
      return { status: 201, body: { invitation: invitation({ personId: kiran }) } };
    });
    await renderApp(`/trees/${TREE_ID}/people/${kiran}/invite`);
    await screen.findByRole('heading', { level: 2, name: 'Invite Kiran Rao' });
    await screen.findByRole('textbox', { name: 'Their email' });
    expect(screen.getByText(/Joining doesn’t give them access to this tree/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Send invitation' }));
    const email = screen.getByRole('textbox', { name: 'Their email' });
    await waitFor(() => expect(email).toHaveFocus());
    expect(email).toHaveAccessibleDescription('Enter an email address.');
    await user.type(email, 'kiran@example.com');
    await user.click(screen.getByRole('button', { name: 'Send invitation' }));
    await waitFor(() => expect(sent).toEqual({ personId: kiran, email: 'kiran@example.com' }));
    await expectNoAxeViolations();
  }, 60_000);

  it('shows the four real stages, resends only while unaccepted, and withdraws after confirming', async () => {
    const user = userEvent.setup();
    const server = mockTreeServer();
    const kiran = server.seed.people.kiran.id;
    let current = invitation({ personId: kiran, stage: 'joined', joinedAt: '2026-09-11T10:30:00.000Z' });
    let withdrawn = false;
    server.api.set(`GET /api/trees/${TREE_ID}/invitations`, () => ({ body: { invitations: withdrawn ? [] : [current] } }));
    server.api.set(`DELETE /api/trees/${TREE_ID}/invitations/i1`, () => {
      withdrawn = true;
      return { status: 204 };
    });
    await renderApp(`/trees/${TREE_ID}/people/${kiran}/invite`);
    const steps = within(await screen.findByRole('list', { name: 'Invitation progress' })).getAllByRole('listitem');
    expect(steps.map((step) => step.textContent)).toEqual([
      expect.stringContaining('Invite sent — done'),
      expect.stringContaining('Joined — done'),
      expect.stringContaining('Built their tree — not yet'),
      expect.stringContaining('Linked — not yet'),
    ]);
    expect(steps[1]).toHaveAttribute('aria-current', 'step');
    // Already accepted: resending would only confuse them.
    expect(screen.queryByRole('button', { name: 'Resend invitation' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Withdraw invitation' }));
    const confirm = await screen.findByRole('dialog', { name: 'Withdraw this invitation?' });
    await user.click(within(confirm).getByRole('button', { name: 'Withdraw' }));
    expect(await screen.findByRole('textbox', { name: 'Their email' })).toBeInTheDocument();

    current = invitation({ personId: kiran });
    withdrawn = false;
    await renderApp(`/trees/${TREE_ID}/people/${kiran}/invite`);
    expect(await screen.findByRole('button', { name: 'Resend invitation' })).toBeInTheDocument();
  }, 60_000);

  it('offers no invitation controls to a viewer', async () => {
    const server = mockTreeServer({ tree: { role: 'viewer' } });
    await renderApp(`/trees/${TREE_ID}/people/${server.seed.people.kiran.id}/invite`);
    expect(await screen.findByRole('heading', { name: 'Editing isn’t available' })).toBeInTheDocument();
  });
});
