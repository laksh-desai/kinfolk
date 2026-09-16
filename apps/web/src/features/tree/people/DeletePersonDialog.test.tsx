import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../../../test/axe';
import { renderApp } from '../../../test/renderApp';
import { TREE_ID } from '../../../test/treeFixtures';
import { findToast, mockTreeServer } from '../../../test/treeServer';

describe('deleting a person (SPEC §3, §6.24)', () => {
  it('names every affected relationship, says who is left without a parent, and is undoable', async () => {
    const user = userEvent.setup();
    const server = mockTreeServer();
    const { suresh, maya, leo } = server.seed.people;
    const { router } = await renderApp(`/trees/${TREE_ID}/people/${suresh.id}`);
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete Suresh Sharma?' });
    expect(within(dialog).getByText('Son of Mohan Sharma')).toBeInTheDocument();
    expect(within(dialog).getByText('Father of Maya Sharma (adopted)')).toBeInTheDocument();
    const modes = within(dialog).getByRole('group', { name: 'What should happen?' });
    expect(within(modes).getByRole('radio', { name: 'Remove Suresh Sharma' })).toBeChecked();
    // Removing the only parent is allowed — the children stay, at the top of their own line.
    expect(within(dialog).getByText(/Maya Sharma and Leo Okonkwo will have no parent in the tree/)).toBeInTheDocument();
    await user.click(within(modes).getByRole('radio', { name: 'Delete Suresh Sharma and all 2 descendants' }));
    expect(within(dialog).queryByText(/will have no parent in the tree/)).not.toBeInTheDocument();
    expect(within(dialog).getByText('Also deleted:')).toBeInTheDocument();
    await expectNoAxeViolations();
    // Focus starts on Cancel, never on the destructive action.
    await user.click(within(dialog).getByRole('button', { name: 'Delete 3 people' }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/trees/${TREE_ID}`));
    await waitFor(() => expect(server.changes).toHaveLength(1));
    const ids = server.graph().people.map((person) => person.id);
    expect(ids).not.toContain(suresh.id);
    expect(ids).not.toContain(maya.id);
    expect(ids).not.toContain(leo.id);

    const toast = await findToast(/Deleted Suresh Sharma and 2 descendants/);
    await user.click(within(toast).getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(server.graph().people.map((person) => person.id)).toEqual(expect.arrayContaining([suresh.id, maya.id, leo.id])));
    expect(await screen.findByRole('button', { name: /^Maya Sharma/ })).toBeInTheDocument();
  }, 60_000);

  it('removes the person at the top of the tree, leaving their children in place', async () => {
    const user = userEvent.setup();
    const server = mockTreeServer();
    const { mohan, sita, vikram } = server.seed.people;
    await renderApp(`/trees/${TREE_ID}/people/${mohan.id}`);
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete Mohan Sharma?' });
    await user.click(within(dialog).getByRole('radio', { name: 'Remove Mohan Sharma' }));
    await user.click(within(dialog).getByRole('button', { name: 'Delete Mohan Sharma' }));
    await waitFor(() => expect(server.changes).toHaveLength(1));
    const graph = server.graph();
    expect(graph.people.some((person) => person.id === mohan.id)).toBe(false);
    // Vikram keeps his mother: only the parent who was deleted leaves the family.
    expect(graph.people.some((person) => person.id === vikram.id)).toBe(true);
    const union = graph.unions.find((candidate) => graph.parentChildren.some((edge) => edge.unionId === candidate.id && edge.childId === vikram.id));
    expect(union).toMatchObject({ partnerAId: sita.id, partnerBId: null });
  }, 60_000);

  it('simply removes someone whose removal orphans no one, and moves the focus if needed', async () => {
    const user = userEvent.setup();
    const server = mockTreeServer();
    const { ravi } = server.seed.people;
    await renderApp(`/trees/${TREE_ID}/people/${ravi.id}`);
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete Ravi Sharma?' });
    expect(within(dialog).getByRole('radio', { name: 'Remove Ravi Sharma' })).toBeChecked();
    expect(within(dialog).getByText(/Ravi Sharma is the focus person\. Relationship labels will be shown relative to/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Delete Ravi Sharma' }));
    await waitFor(() => expect(server.changes).toHaveLength(1));
    expect(server.graph().focusPersonId).not.toBe(ravi.id);
    expect(server.graph().people.some((person) => person.id === ravi.id)).toBe(false);
  }, 60_000);
});
