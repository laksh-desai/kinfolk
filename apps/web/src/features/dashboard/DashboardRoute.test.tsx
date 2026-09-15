import type { TreeSummaryDto } from '@kinfolk/shared/schemas/tree';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../../test/axe';
import { mockApi, testUser } from '../../test/mockApi';
import { renderApp } from '../../test/renderApp';
import { TREE_ID, treeDto } from '../../test/treeFixtures';

const summary = (overrides: Partial<TreeSummaryDto>): TreeSummaryDto => ({ ...treeDto(), peopleCount: 60, updatedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(), ...overrides });

describe('dashboard (SPEC §5.2, §6.13)', () => {
  it('lists owned and shared trees with people count, status, last edit, and a role badge for shared ones', async () => {
    mockApi({
      'GET /api/auth/me': () => ({ body: { user: testUser } }),
      'GET /api/me/inbox': () => ({ body: { accessInvites: [], linkRequests: [], invitations: [], changeRequests: [] } }),
      'GET /api/trees': () => ({
        body: {
          trees: [
            summary({}),
            summary({ id: '22222222-2222-4222-8222-222222222222', name: 'Rao family', role: 'editor', status: 'in_review', peopleCount: 1, owner: { id: 'x', name: 'Lakshmi Rao' } }),
          ],
        },
      }),
    });
    await renderApp('/');
    const owned = await screen.findByRole('region', { name: 'Your trees' });
    const card = within(owned).getByRole('listitem');
    expect(within(card).getByRole('link', { name: 'Sharma family' })).toHaveAttribute('href', `/trees/${TREE_ID}`);
    expect(card).toHaveTextContent('60 people');
    expect(card).toHaveTextContent('Status: Draft');
    expect(card).toHaveTextContent('Edited 2 hours ago');
    const shared = screen.getByRole('region', { name: 'Shared with you' });
    expect(shared).toHaveTextContent('Rao family');
    expect(shared).toHaveTextContent('1 person');
    expect(shared).toHaveTextContent('Editor · shared by Lakshmi Rao');
    expect(shared).toHaveTextContent('In review');
    await expectNoAxeViolations();
  }, 60_000);

  it('has a real empty state that explains trees and creates one', async () => {
    const user = userEvent.setup();
    const created = { ...treeDto({ name: 'Osei family' }) };
    const api = mockApi({
      'GET /api/auth/me': () => ({ body: { user: testUser } }),
      'GET /api/me/inbox': () => ({ body: { accessInvites: [], linkRequests: [], invitations: [], changeRequests: [] } }),
      'GET /api/trees': () => ({ body: { trees: [] } }),
      'POST /api/trees': () => ({ status: 201, body: { tree: created } }),
      [`GET /api/trees/${TREE_ID}/graph`]: () => ({ body: { tree: created, graph: { people: [], unions: [], parentChildren: [], focusPersonId: null } } }),
    });
    const { router } = await renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Start your first family tree' })).toBeInTheDocument();
    expect(screen.getByText(/A family tree maps the people in a family/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New family tree' }));
    const dialog = await screen.findByRole('dialog', { name: 'New family tree' });
    await user.click(within(dialog).getByRole('button', { name: 'Create tree' }));
    const name = within(dialog).getByRole('textbox', { name: 'Tree name' });
    await waitFor(() => expect(name).toHaveFocus());
    expect(name).toHaveAccessibleDescription('Give the tree a name.');
    await user.type(name, 'Osei family');
    await user.click(within(dialog).getByRole('button', { name: 'Create tree' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/trees/${TREE_ID}`));
    expect(api.calls.find((call) => call.method === 'POST')?.body).toEqual({ name: 'Osei family' });
    expect(await screen.findByRole('link', { name: 'Add the first person' })).toBeInTheDocument();
  }, 60_000);

  it('shows skeletons while loading and a retry when loading fails', async () => {
    const user = userEvent.setup();
    let attempts = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mockApi({
      'GET /api/auth/me': () => ({ body: { user: testUser } }),
      'GET /api/me/inbox': () => ({ body: { accessInvites: [], linkRequests: [], invitations: [], changeRequests: [] } }),
      'GET /api/trees': async () => {
        attempts += 1;
        if (attempts === 1) {
          await gate;
          return { status: 404, body: { error: { code: 'not_found', message: 'That page could not be found.' } } };
        }
        return { body: { trees: [summary({})] } };
      },
    });
    await renderApp('/');
    expect(await screen.findByText('Loading your family trees')).toBeInTheDocument();
    release();
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByRole('heading', { name: 'Your family trees didn’t load' })).toBeInTheDocument();
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: 'Sharma family' })).toBeInTheDocument();
  }, 60_000);
});
