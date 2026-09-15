import type { InboxDto } from '@kinfolk/shared/schemas/collaboration';
import type { TreeSummaryDto } from '@kinfolk/shared/schemas/tree';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../../test/axe';
import { mockApi, testUser } from '../../test/mockApi';
import { renderApp } from '../../test/renderApp';
import { TREE_ID, treeDto } from '../../test/treeFixtures';

const OTHER_TREE = '22222222-2222-4222-8222-222222222222';
const summary = (overrides: Partial<TreeSummaryDto> = {}): TreeSummaryDto => ({ ...treeDto(), peopleCount: 3, ...overrides });

const emptyInbox: InboxDto = { accessInvites: [], linkRequests: [], invitations: [] };

function dashboard(inbox: Partial<InboxDto>, trees: TreeSummaryDto[] = []) {
  return mockApi({
    'GET /api/auth/me': () => ({ body: { user: testUser } }),
    'GET /api/trees': () => ({ body: { trees } }),
    'GET /api/me/inbox': () => ({ body: { ...emptyInbox, ...inbox } }),
  });
}

describe('what’s waiting for you on the dashboard (SPEC §5.2)', () => {
  it('is absent when nothing is waiting', async () => {
    dashboard({}, [summary()]);
    await renderApp('/');
    await screen.findByRole('link', { name: 'Sharma family' });
    expect(screen.queryByRole('region', { name: 'Waiting for you' })).not.toBeInTheDocument();
  });

  it('accepts an access invitation, which adds the tree to the list', async () => {
    const user = userEvent.setup();
    let accepted = false;
    const api = dashboard({ accessInvites: [{ id: 'a1', tree: { id: OTHER_TREE, name: 'Rao family' }, role: 'editor', invitedBy: 'Lakshmi Rao', invitedAt: '2026-09-12T10:00:00.000Z' }] });
    api.set('GET /api/trees', () => ({ body: { trees: accepted ? [summary({ id: OTHER_TREE, name: 'Rao family', role: 'editor' })] : [] } }));
    api.set('GET /api/me/inbox', () => ({
      body: accepted ? emptyInbox : { ...emptyInbox, accessInvites: [{ id: 'a1', tree: { id: OTHER_TREE, name: 'Rao family' }, role: 'editor', invitedBy: 'Lakshmi Rao', invitedAt: '2026-09-12T10:00:00.000Z' }] },
    }));
    api.set('POST /api/me/access-invites/a1/accept', () => {
      accepted = true;
      return { status: 204 };
    });
    await renderApp('/');
    const waiting = await screen.findByRole('region', { name: 'Waiting for you' });
    expect(waiting).toHaveTextContent('Lakshmi Rao invited you to help edit “Rao family”.');
    await expectNoAxeViolations();
    await user.click(within(waiting).getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(screen.getByTestId('live-polite')).toHaveTextContent('“Rao family” is now in your family trees.'));
    expect(await screen.findByRole('link', { name: 'Rao family' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Waiting for you' })).not.toBeInTheDocument();
  }, 60_000);

  it('sends someone to review a link request on the right tree', async () => {
    const user = userEvent.setup();
    dashboard({
      linkRequests: [
        {
          id: 'r1',
          toTree: { id: TREE_ID, name: 'Sharma family' },
          person: { id: 'p1', name: 'Kiran Rao' },
          fromTree: { id: OTHER_TREE, name: 'Rao family' },
          requestedBy: 'Kiran Rao',
          createdAt: '2026-09-13T10:00:00.000Z',
        },
      ],
    });
    const { router } = await renderApp('/');
    const waiting = await screen.findByRole('region', { name: 'Waiting for you' });
    expect(waiting).toHaveTextContent('Kiran Rao wants to link their tree “Rao family” to Kiran Rao in “Sharma family”.');
    await user.click(within(waiting).getByRole('link', { name: 'Review' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/trees/${TREE_ID}/link-requests`));
  }, 60_000);

  it('asks to link one of your own trees, or tells you to build one first', async () => {
    const user = userEvent.setup();
    const invitation = { id: 'i1', tree: { id: TREE_ID, name: 'Sharma family' }, personName: 'Kiran Rao', invitedBy: 'Asha Rao', stage: 'joined' as const, pendingLinkRequest: false };
    const api = dashboard({ invitations: [invitation] });
    await renderApp('/');
    const waiting = await screen.findByRole('region', { name: 'Waiting for you' });
    expect(waiting).toHaveTextContent('Asha Rao added you as Kiran Rao in “Sharma family”.');
    expect(within(waiting).getByText('Next: build your own family tree, then link it here.')).toBeInTheDocument();
    await user.click(within(waiting).getByRole('button', { name: 'New family tree' }));
    expect(await screen.findByRole('dialog', { name: 'New family tree' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    let requested: unknown = null;
    api.set('GET /api/trees', () => ({ body: { trees: [summary({ id: OTHER_TREE, name: 'Rao family' })] } }));
    api.set('POST /api/me/invitations/i1/link-request', (request) => {
      requested = request.body;
      return { status: 201, body: { id: 'r1' } };
    });
    api.set('GET /api/me/inbox', () => ({ body: { ...emptyInbox, invitations: [{ ...invitation, pendingLinkRequest: requested !== null }] } }));
    // Start a fresh screen: two dashboards in one document would make every query ambiguous.
    cleanup();
    await renderApp('/');
    const second = await screen.findByRole('region', { name: 'Waiting for you' });
    expect(await within(second).findByRole('combobox', { name: 'Your tree to link' })).toHaveValue(OTHER_TREE);
    await user.click(within(second).getByRole('button', { name: 'Ask to link' }));
    await waitFor(() => expect(requested).toEqual({ fromTreeId: OTHER_TREE }));
    expect(await screen.findByText('You asked to link your tree. Waiting for Asha Rao to approve it.')).toBeInTheDocument();
  }, 60_000);
});
