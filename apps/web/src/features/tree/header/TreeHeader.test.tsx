import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../../../test/axe';
import { renderApp } from '../../../test/renderApp';
import { TREE_ID } from '../../../test/treeFixtures';
import { findToast, mockTreeServer } from '../../../test/treeServer';

describe('tree management from the tree page (SPEC §6.3, §6.24)', () => {
  it('opens the rename field on the first click, saves on Enter, and can undo', async () => {
    const user = userEvent.setup();
    const server = mockTreeServer();
    const names: string[] = [];
    server.api.set(`PATCH /api/trees/${TREE_ID}`, (request) => {
      const { name } = request.body as { name: string };
      names.push(name);
      return { body: { tree: { ...server.graph(), id: TREE_ID, name, description: null, status: 'draft', focusPersonId: null, version: 1, role: 'owner', owner: { id: 'o', name: 'Asha Rao' }, thumbnailUrl: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: new Date().toISOString() } } };
    });
    await renderApp(`/trees/${TREE_ID}`);
    // One click — not two (§6.3).
    await user.click(await screen.findByRole('button', { name: 'Rename tree' }));
    const field = screen.getByRole('textbox', { name: 'Tree name' });
    await waitFor(() => expect(field).toHaveFocus());
    expect(field).toHaveValue('Sharma family');
    await user.clear(field);
    await user.type(field, 'Sharma–Rao family{Enter}');
    expect(await screen.findByRole('heading', { level: 1, name: 'Sharma–Rao family' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Rename tree' })).toHaveFocus());
    await waitFor(() => expect(document.title).toBe('Sharma–Rao family · Kinfolk'));
    const toast = await findToast(/Renamed to Sharma–Rao family/);
    await user.click(within(toast).getByRole('button', { name: 'Undo' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Sharma family' })).toBeInTheDocument();
    expect(names).toEqual(['Sharma–Rao family', 'Sharma family']);
  }, 60_000);

  it('cancels a rename with Escape and refuses an empty name visibly', async () => {
    const user = userEvent.setup();
    mockTreeServer();
    await renderApp(`/trees/${TREE_ID}`);
    await user.click(await screen.findByRole('button', { name: 'Rename tree' }));
    const field = screen.getByRole('textbox', { name: 'Tree name' });
    await user.clear(field);
    await user.click(screen.getByRole('button', { name: 'Save name' }));
    await waitFor(() => expect(field).toHaveFocus());
    expect(field).toHaveAccessibleDescription('Give the tree a name.');
    await user.keyboard('{Escape}');
    expect(await screen.findByRole('heading', { level: 1, name: 'Sharma family' })).toBeInTheDocument();
  }, 60_000);

  it('deletes a tree only after its name is typed, and says what goes with it', async () => {
    const user = userEvent.setup();
    const server = mockTreeServer();
    let deleted: unknown = null;
    server.api.set(`DELETE /api/trees/${TREE_ID}`, (request) => {
      deleted = request.body;
      return { status: 204 };
    });
    server.api.set('GET /api/trees', () => ({ body: { trees: [] } }));
    const { router } = await renderApp(`/trees/${TREE_ID}`);
    await user.click(await screen.findByRole('button', { name: 'Settings for Sharma family' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete this tree…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete Sharma family?' });
    expect(dialog).toHaveTextContent('60 people, their details, photos, and planning answers');
    expect(dialog).toHaveTextContent('This can’t be undone.');
    await expectNoAxeViolations();
    await user.click(within(dialog).getByRole('button', { name: 'Delete this tree' }));
    expect(await within(dialog).findByText('Type “Sharma family” exactly to confirm.')).toBeInTheDocument();
    expect(deleted).toBeNull();
    await user.type(within(dialog).getByRole('textbox', { name: 'Type “Sharma family” to confirm' }), 'Sharma family');
    await user.click(within(dialog).getByRole('button', { name: 'Delete this tree' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(deleted).toEqual({ confirmName: 'Sharma family' });
    expect(await screen.findByRole('heading', { name: 'Start your first family tree' })).toBeInTheDocument();
  }, 60_000);

  it('shows no rename or delete to anyone but the owner', async () => {
    mockTreeServer({ tree: { role: 'editor' } });
    await renderApp(`/trees/${TREE_ID}`);
    await screen.findByRole('heading', { level: 1, name: 'Sharma family' });
    expect(screen.queryByRole('button', { name: 'Rename tree' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Settings for Sharma family' })).not.toBeInTheDocument();
  });
});
