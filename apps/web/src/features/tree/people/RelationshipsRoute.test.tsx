import { resolveKinship } from '@kinfolk/shared/kinship/resolveKinship';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../../../test/axe';
import { renderApp } from '../../../test/renderApp';
import { TREE_ID } from '../../../test/treeFixtures';
import { mockTreeServer } from '../../../test/treeServer';

describe('correcting relationships (SPEC §4.6)', () => {
  it('changes a partnership’s status and years, each as an undoable change', async () => {
    const user = userEvent.setup();
    const server = mockTreeServer();
    const { vikram, priti } = server.seed.people;
    await renderApp(`/trees/${TREE_ID}/people/${vikram.id}/relationships`);
    await screen.findByRole('heading', { level: 2, name: 'Vikram’s relationships' });
    expect(screen.getByText('Former wife: Priti Kapoor')).toBeInTheDocument();
    const status = screen.getAllByRole('combobox', { name: 'Status' })[0] as HTMLElement;
    await user.selectOptions(status, 'widowed');
    await waitFor(() => expect(server.changes).toHaveLength(1));
    expect(server.changes[0]?.description).toBe('Marked Vikram Sharma and Priti Kapoor as widowed');
    expect(resolveKinship(server.graph(), vikram.id, priti.id).label).not.toMatch(/Former/);
    expect(await screen.findByRole('button', { name: 'Undo: Marked Vikram Sharma and Priti Kapoor as widowed' })).toBeInTheDocument();

    const married = screen.getAllByRole('textbox', { name: 'Year married' })[0] as HTMLElement;
    await user.clear(married);
    await user.type(married, '81');
    await user.click(screen.getAllByRole('button', { name: 'Save years' })[0] as HTMLElement);
    await waitFor(() => expect(married).toHaveFocus());
    expect(married).toHaveAccessibleDescription('Enter the start year as a four-digit year, like 1985.');
    await user.type(married, '19');
    await user.clear(married);
    await user.type(married, '1981');
    await user.click(screen.getAllByRole('button', { name: 'Save years' })[0] as HTMLElement);
    await waitFor(() => expect(server.changes).toHaveLength(2));
    expect(server.graph().unions.find((union) => union.id === server.seed.unions.vikramPriti.id)?.startDate).toEqual({ year: 1981, month: null, day: null, approximate: false });
    await expectNoAxeViolations();
  }, 60_000);

  it('changes a child’s kind of link, moves a child to other parents, and detaches without deleting anyone', async () => {
    const user = userEvent.setup();
    const server = mockTreeServer();
    const { ravi, vikram, karan, ethan } = server.seed.people;
    await renderApp(`/trees/${TREE_ID}/people/${ravi.id}/relationships`);
    await screen.findByRole('heading', { level: 2, name: 'Ravi’s relationships' });

    await user.selectOptions(screen.getByRole('combobox', { name: 'How Ravi Sharma is their child' }), 'adopted');
    await waitFor(() => expect(server.changes).toHaveLength(1));
    expect(resolveKinship(server.graph(), ravi.id, vikram.id).label).toBe('Adoptive father');

    // Karan is Vikram's son from his first marriage; move Ravi into that family instead.
    await user.selectOptions(screen.getByRole('combobox', { name: 'Move to different parents' }), 'Vikram Sharma and Priti Kapoor');
    await user.click(screen.getByRole('button', { name: 'Move' }));
    await waitFor(() => expect(server.changes).toHaveLength(2));
    expect(resolveKinship(server.graph(), ravi.id, karan.id).label).toBe('Brother');

    // Detaching a child keeps both people.
    await user.click(await screen.findByRole('button', { name: 'Detach Aarav Sharma' }));
    await waitFor(() => expect(server.changes).toHaveLength(3));
    expect(server.graph().people.some((person) => person.firstName === 'Aarav')).toBe(true);
    expect(resolveKinship(server.graph(), ravi.id, server.seed.people.aarav.id).label).not.toBe('Son');

    // Detaching a partner who shares children asks first and explains what happens.
    await user.click(screen.getByRole('button', { name: 'Detach partner' }));
    const dialog = await screen.findByRole('dialog', { name: 'Detach Priya Sharma?' });
    expect(within(dialog).getByText(/Detaching keeps the child with Ravi Sharma/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Detach' }));
    await waitFor(() => expect(server.changes).toHaveLength(4));
    expect(resolveKinship(server.graph(), ravi.id, server.seed.people.priya.id).category).not.toBe('partner');
    expect(ethan).toBeDefined();
  }, 60_000);

  it('never offers a move that would make someone their own ancestor', async () => {
    const user = userEvent.setup();
    const server = mockTreeServer();
    const { vikram } = server.seed.people;
    await renderApp(`/trees/${TREE_ID}/people/${vikram.id}/relationships`);
    await screen.findByRole('heading', { level: 2, name: 'Vikram’s relationships' });
    // Vikram is Ravi's father, so Ravi and Priya's family can never be Vikram's parents (ADR 030).
    const families = screen.getByRole('combobox', { name: 'Move to different parents' });
    expect(within(families).queryByRole('option', { name: 'Ravi Sharma and Priya Sharma' })).not.toBeInTheDocument();
    expect(within(families).getByRole('option', { name: /Suresh Sharma/ })).toBeInTheDocument();

    // Pressing Move without choosing still says what to do, and changes nothing.
    await user.click(screen.getByRole('button', { name: 'Move' }));
    const alert = await screen.findByText(/Choose the family to move them to first/);
    await waitFor(() => expect(alert.closest('[tabindex="-1"]')).toHaveFocus());
    expect(server.changes).toHaveLength(0);
  }, 60_000);
});
