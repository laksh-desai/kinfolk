import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../../test/axe';
import { renderApp } from '../../test/renderApp';
import { TREE_ID } from '../../test/treeFixtures';
import { mockTreeServer } from '../../test/treeServer';

describe('link requests (SPEC §5.5)', () => {
  it('explains what link requests are when there are none', async () => {
    const server = mockTreeServer();
    server.api.set(`GET /api/trees/${TREE_ID}/link-requests`, () => ({ body: { requests: [] } }));
    await renderApp(`/trees/${TREE_ID}/link-requests`);
    const dialog = await screen.findByRole('dialog', { name: 'Link requests' });
    expect(within(dialog).getByText(/they can ask to link it to their person in yours/)).toBeInTheDocument();
    expect(await within(dialog).findByRole('heading', { name: 'No link requests' })).toBeInTheDocument();
    await expectNoAxeViolations();
  }, 60_000);

  it('approves a request, which links the trees and updates the tree', async () => {
    const user = userEvent.setup();
    const server = mockTreeServer();
    const kiran = server.seed.people.kiran.id;
    let approved = false;
    server.api.set(`GET /api/trees/${TREE_ID}/link-requests`, () => ({
      body: {
        requests: [
          {
            id: 'r1',
            status: approved ? 'approved' : 'pending',
            person: { id: kiran, name: 'Kiran Rao' },
            fromTree: { id: '33333333-3333-4333-8333-333333333333', name: 'Rao family' },
            requestedBy: 'Kiran Rao',
            createdAt: new Date(Date.now() - 3_600_000).toISOString(),
            resolvedAt: null,
          },
        ],
      },
    }));
    server.api.set(`POST /api/trees/${TREE_ID}/link-requests/r1/approve`, () => {
      approved = true;
      return { status: 204 };
    });
    await renderApp(`/trees/${TREE_ID}/link-requests`);
    const dialog = await screen.findByRole('dialog', { name: 'Link requests' });
    expect(await within(dialog).findByText(/wants to link/)).toHaveTextContent('Kiran Rao wants to link Rao family to Kiran Rao.');
    expect(within(dialog).getByText(/Waiting for you · asked 1 hour ago/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(approved).toBe(true));
    await waitFor(() => expect(screen.getByTestId('live-polite')).toHaveTextContent('Linked Rao family to Kiran Rao.'));
    await waitFor(() => expect(within(dialog).queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument());
    expect(within(dialog).getByText(/Approved · asked/)).toBeInTheDocument();
  }, 60_000);

  it('tells a non-owner that only the owner reviews them', async () => {
    mockTreeServer({ tree: { role: 'editor' } });
    await renderApp(`/trees/${TREE_ID}/link-requests`);
    expect(await screen.findByText('Only the owner of “Sharma family” reviews link requests.')).toBeInTheDocument();
  });
});
