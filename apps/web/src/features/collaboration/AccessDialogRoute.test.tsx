import type { AccessListDto } from '@kinfolk/shared/schemas/collaboration';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../../test/axe';
import { renderApp } from '../../test/renderApp';
import { TREE_ID } from '../../test/treeFixtures';
import { mockTreeServer } from '../../test/treeServer';

const member = (overrides: Partial<AccessListDto['members'][number]> = {}) => ({
  id: 'a1',
  email: 'kiran@example.com',
  name: 'Kiran Rao',
  role: 'viewer' as const,
  status: 'active' as const,
  invitedAt: '2026-09-01T10:00:00.000Z',
  acceptedAt: '2026-09-02T10:00:00.000Z',
  ...overrides,
});

function accessServer(overrides: Partial<AccessListDto> = {}) {
  const server = mockTreeServer(overrides.canManage === false ? { tree: { role: 'viewer' } } : {});
  const list: AccessListDto = { owner: { name: 'Asha Rao', email: 'asha@example.com' }, members: [member()], canManage: true, ...overrides };
  server.api.set(`GET /api/trees/${TREE_ID}/access`, () => ({ body: list }));
  server.api.set(`GET /api/trees/${TREE_ID}/share-links`, () => ({ body: { links: [] } }));
  return { server, list };
}

describe('sharing a tree (SPEC §5.6)', () => {
  it('invites someone by email, with the server’s message beside the field when it fails', async () => {
    const user = userEvent.setup();
    const { server } = accessServer();
    server.api.set(`POST /api/trees/${TREE_ID}/access`, (request) => {
      const body = request.body as { email: string };
      if (body.email === 'kiran@example.com') {
        return { status: 409, body: { error: { code: 'access_exists', message: 'Already there', fields: { email: 'kiran@example.com already has access. Change their role in the list instead.' } } } };
      }
      return { status: 201, body: { access: member({ id: 'a2', email: body.email, name: null, status: 'invited', acceptedAt: null }) } };
    });
    await renderApp(`/trees/${TREE_ID}/access`);
    const dialog = await screen.findByRole('dialog', { name: 'Share “Sharma family”' });
    await user.click(within(dialog).getByRole('button', { name: 'Send invitation' }));
    const email = within(dialog).getByRole('textbox', { name: 'Email' });
    await waitFor(() => expect(email).toHaveFocus());
    expect(email).toHaveAccessibleDescription('Enter an email address.');

    await user.type(email, 'kiran@example.com');
    await user.click(within(dialog).getByRole('button', { name: 'Send invitation' }));
    await waitFor(() => expect(email).toHaveAccessibleDescription(/already has access/));

    await user.clear(email);
    await user.type(email, 'lakshmi@example.com');
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Role' }), 'editor');
    await user.click(within(dialog).getByRole('button', { name: 'Send invitation' }));
    await waitFor(() => expect(server.api.calls.filter((call) => call.method === 'POST')).toHaveLength(2));
    expect(server.api.calls.filter((call) => call.method === 'POST').at(-1)?.body).toEqual({ email: 'lakshmi@example.com', role: 'editor', name: undefined });
    await waitFor(() => expect(email).toHaveValue(''));
  }, 60_000);

  it('changes a role inline, revokes after confirming, and searches and sorts the list', async () => {
    const user = userEvent.setup();
    const { server } = accessServer({
      members: [member(), member({ id: 'a2', name: 'Bala Menon', email: 'bala@example.com', role: 'editor' }), member({ id: 'a3', name: null, email: 'zara@example.com', status: 'invited', acceptedAt: null })],
    });
    let patched: unknown = null;
    let revoked: string | null = null;
    server.api.set(`PATCH /api/trees/${TREE_ID}/access/a1`, (request) => {
      patched = request.body;
      return { body: { access: member({ role: 'editor' }) } };
    });
    server.api.set(`DELETE /api/trees/${TREE_ID}/access/a2`, () => {
      revoked = 'a2';
      return { status: 204 };
    });
    await renderApp(`/trees/${TREE_ID}/access`);
    const list = await screen.findByRole('list', { name: 'People with access' });
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('Asha Rao');
    expect(within(list).getByText('Invited 2 weeks ago, not accepted yet', { exact: false })).toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Role for Kiran Rao' }), 'editor');
    await waitFor(() => expect(patched).toEqual({ role: 'editor' }));
    await waitFor(() => expect(screen.getByTestId('live-polite')).toHaveTextContent('Kiran Rao is now an editor.'));

    await user.click(screen.getByRole('button', { name: 'Remove access for Bala Menon' }));
    const confirm = await screen.findByRole('dialog', { name: 'Remove Bala Menon’s access?' });
    await user.click(within(confirm).getByRole('button', { name: 'Remove access' }));
    await waitFor(() => expect(revoked).toBe('a2'));

    await user.click(screen.getByRole('button', { name: 'Email' }));
    const sorted = within(screen.getByRole('list', { name: 'People with access' })).getAllByRole('listitem').slice(1);
    expect(sorted.map((row) => row.textContent?.includes('bala@example.com'))).toEqual([true, false, false]);
    await user.type(screen.getByRole('searchbox', { name: 'Search people with access' }), 'zara');
    expect(within(screen.getByRole('list', { name: 'People with access' })).getAllByRole('listitem')).toHaveLength(2);
    await expectNoAxeViolations();
  }, 60_000);

  it('creates a share link, offers it for copying once, and turns it off', async () => {
    const user = userEvent.setup();
    const { server } = accessServer();
    const url = 'http://localhost:5173/s/token-abc';
    const link = { id: 'l1', createdAt: new Date(Date.now() - 60_000).toISOString(), expiresAt: '2026-10-14T12:00:00.000Z', revokedAt: null, createdBy: 'Asha Rao', status: 'active' as const };
    let created = false;
    let revoked = false;
    server.api.set(`GET /api/trees/${TREE_ID}/share-links`, () => ({ body: { links: created && !revoked ? [link] : [] } }));
    server.api.set(`POST /api/trees/${TREE_ID}/share-links`, (request) => {
      created = true;
      expect(request.body).toEqual({ expiresInDays: 7 });
      return { status: 201, body: { link, url } };
    });
    server.api.set(`DELETE /api/trees/${TREE_ID}/share-links/l1`, () => {
      revoked = true;
      return { status: 204 };
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', Object.assign(Object.create(Object.getPrototypeOf(navigator)), navigator, { clipboard: { writeText } }));

    await renderApp(`/trees/${TREE_ID}/access`);
    const dialog = await screen.findByRole('dialog', { name: 'Share “Sharma family”' });
    expect(within(dialog).getByText(/never contact details, addresses, or notes/)).toBeInTheDocument();
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Link works for' }), '7');
    await user.click(within(dialog).getByRole('button', { name: 'Create link' }));
    const field = await within(dialog).findByRole('textbox', { name: /copy it now/i });
    expect(field).toHaveValue(url);
    await user.click(within(dialog).getByRole('button', { name: 'Copy link' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(url));
    expect(await screen.findByText('Copied to your clipboard.')).toBeInTheDocument();

    const links = await screen.findByRole('list', { name: 'Share links' });
    expect(links).toHaveTextContent('Works until Oct 14, 2026');
    await user.click(within(links).getByRole('button', { name: /^Turn off the link created/ }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Turn off this link?' })).getByRole('button', { name: 'Turn off link' }));
    await waitFor(() => expect(revoked).toBe(true));
  }, 60_000);

  it('shows members the list without any way to change it', async () => {
    accessServer({ canManage: false });
    await renderApp(`/trees/${TREE_ID}/access`);
    const dialog = await screen.findByRole('dialog', { name: 'People with access to “Sharma family”' });
    expect(within(dialog).getByText('Only the owner can change who has access.')).toBeInTheDocument();
    expect(await within(dialog).findByRole('list', { name: 'People with access' })).toHaveTextContent('Kiran Rao');
    expect(within(dialog).queryByRole('button', { name: 'Send invitation' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('combobox', { name: /^Role for/ })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Create link' })).not.toBeInTheDocument();
  }, 60_000);
});
