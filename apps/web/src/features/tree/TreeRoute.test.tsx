import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../../test/axe';
import { renderApp } from '../../test/renderApp';
import { TREE_ID } from '../../test/treeFixtures';
import { mockTreeServer } from '../../test/treeServer';

describe('tree page editing affordances', () => {
  it('opens a card’s menu with right-click and Shift+F10, and its actions work', async () => {
    const user = userEvent.setup();
    const server = mockTreeServer();
    const { router } = await renderApp(`/trees/${TREE_ID}`);
    const mohan = await screen.findByRole('button', { name: /^Mohan Sharma/ });
    fireEvent.contextMenu(mohan, { clientX: 300, clientY: 200 });
    const menu = await screen.findByRole('menu', { name: 'Actions for Mohan Sharma' });
    for (const name of ['Open details', 'Add parent', 'Add partner', 'Add child', 'Add sibling', 'More relatives…', 'Edit details', 'Relationships', 'Set as focus', 'Compare…', 'Hide descendants', 'Merge with…', 'Delete…']) {
      expect(within(menu).getByRole('menuitem', { name })).toBeInTheDocument();
    }
    await user.click(within(menu).getByRole('menuitem', { name: 'Add parent' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/trees/${TREE_ID}/people/${server.seed.people.mohan.id}/add/parent`));

    const sita = screen.getByRole('button', { name: /^Sita Sharma/ });
    sita.focus();
    await user.keyboard('{Shift>}{F10}{/Shift}');
    const keyboardMenu = await screen.findByRole('menu', { name: 'Actions for Sita Sharma' });
    await waitFor(() => expect(within(keyboardMenu).getAllByRole('menuitem')[0]).toHaveFocus());
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('button', { name: /^Sita Sharma/ })).toHaveFocus());
  }, 60_000);

  it('sets the focus person from the menu, relabelling everyone, with undo', async () => {
    const user = userEvent.setup();
    const server = mockTreeServer();
    await renderApp(`/trees/${TREE_ID}`);
    fireEvent.contextMenu(await screen.findByRole('button', { name: /^Emma Becker/ }), { clientX: 10, clientY: 10 });
    await user.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Set as focus' }));
    expect(await screen.findByRole('button', { name: 'Emma Becker, Self, focus person' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ravi Sharma, First cousin' })).toBeInTheDocument();
    await waitFor(() => expect(server.graph().focusPersonId).toBe(server.seed.people.emma.id));
    await user.click(await screen.findByRole('button', { name: 'Undo: Made Emma Becker the focus person' }));
    expect(await screen.findByRole('button', { name: 'Ravi Sharma, Self, focus person' })).toBeInTheDocument();
  }, 60_000);

  it('offers only viewing actions in a viewer’s menu, and no save or undo controls', async () => {
    mockTreeServer({ tree: { role: 'viewer' } });
    await renderApp(`/trees/${TREE_ID}`);
    fireEvent.contextMenu(await screen.findByRole('button', { name: /^Mohan Sharma/ }), { clientX: 10, clientY: 10 });
    const menu = await screen.findByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Open details', 'Compare…', 'Hide descendants']);
    expect(screen.queryByRole('button', { name: /^Undo/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Add person' })).not.toBeInTheDocument();
  }, 60_000);

  it('compares two people both ways and highlights the path on the canvas', async () => {
    const server = mockTreeServer();
    const { ravi, emma } = server.seed.people;
    await renderApp(`/trees/${TREE_ID}/compare?a=${emma.id}&b=${ravi.id}`);
    expect(await screen.findByText('Emma Becker is Ravi Sharma’s first cousin.')).toBeInTheDocument();
    expect(screen.getByText('Ravi Sharma is Emma Becker’s first cousin.')).toBeInTheDocument();
    const steps = within(screen.getByRole('list', { name: 'How they connect' })).getAllByRole('listitem');
    expect(steps.map((step) => step.textContent)).toEqual(['1Emma Becker', '2Anita Becker', '3Mohan Sharma', '4Vikram Sharma', '5Ravi Sharma']);
    await waitFor(() => expect(document.title).toBe('Compare two people · Sharma family · Kinfolk'));
    // Everyone off the path is dimmed; the path is not.
    expect(screen.getByRole('button', { name: /^Mohan Sharma/ })).not.toHaveClass('opacity-40');
    expect(screen.getByRole('button', { name: /^Priya Sharma/ })).toHaveClass('opacity-40');
    await expectNoAxeViolations();
  }, 60_000);

  it('opens search with "/" from anywhere on the page, but not while typing', async () => {
    const user = userEvent.setup();
    mockTreeServer();
    await renderApp(`/trees/${TREE_ID}`);
    await screen.findByRole('button', { name: /^Ravi Sharma/ });
    // Focus is on the page body, outside the canvas: the shortcut still works.
    (document.activeElement as HTMLElement | null)?.blur();
    await user.keyboard('/');
    const input = await screen.findByRole('combobox', { name: 'Find a person by name' });
    expect(input).toHaveFocus();
    // Inside a field a slash is just a slash.
    await user.keyboard('/');
    expect(input).toHaveValue('/');
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('combobox')).not.toBeInTheDocument());
  }, 60_000);

  it('picks the two people to compare by typing their names', async () => {
    const user = userEvent.setup();
    const server = mockTreeServer();
    const { emma, ravi } = server.seed.people;
    const { router } = await renderApp(`/trees/${TREE_ID}/compare`);
    const first = await screen.findByRole('combobox', { name: 'First person' });
    await user.type(first, 'emma');
    await user.click(await screen.findByRole('option', { name: /Emma Becker/ }));
    expect(first).toHaveValue('Emma Becker');
    await waitFor(() => expect(router.state.location.search).toBe(`?a=${emma.id}`));
    const second = screen.getByRole('combobox', { name: 'Second person' });
    await user.type(second, 'ravi sh');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(router.state.location.search).toBe(`?a=${emma.id}&b=${ravi.id}`));
    expect(await screen.findByText('Emma Becker is Ravi Sharma’s first cousin.')).toBeInTheDocument();
    await expectNoAxeViolations();
  }, 60_000);

  it('lists every keyboard shortcut in a dialog opened with "?"', async () => {
    const user = userEvent.setup();
    mockTreeServer();
    await renderApp(`/trees/${TREE_ID}`);
    await screen.findByRole('button', { name: /^Ravi Sharma/ });
    await user.keyboard('?');
    const dialog = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' });
    for (const key of ['/', 'F', 'Enter', '⌘Z']) expect(within(dialog).getAllByText(key).length).toBeGreaterThan(0);
    await expectNoAxeViolations();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  }, 60_000);

  it('lists placeholders and missing birth dates under Needs detail', async () => {
    const user = userEvent.setup();
    const server = mockTreeServer();
    const { router } = await renderApp(`/trees/${TREE_ID}`);
    await user.click(await screen.findByRole('link', { name: /^Needs detail \(\d+\)$/ }));
    const panel = await screen.findByRole('complementary', { name: 'Needs detail' });
    expect(within(panel).getByRole('heading', { name: 'Unnamed placeholders (2)' })).toBeInTheDocument();
    await user.click(within(panel).getByRole('link', { name: 'Radha’s parent — unnamed' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/trees/${TREE_ID}/people/${server.seed.people.radhaParent.id}/edit`));
  }, 60_000);
});
