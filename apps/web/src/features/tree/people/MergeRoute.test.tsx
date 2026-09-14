import { resolveKinship } from '@kinfolk/shared/kinship/resolveKinship';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../../../test/axe';
import { renderApp } from '../../../test/renderApp';
import { TREE_ID } from '../../../test/treeFixtures';
import { findToast, mockTreeServer } from '../../../test/treeServer';

describe('merging duplicates (SPEC §4.2, §4.6)', () => {
  it('merges a placeholder into the real person, combining relationships, and undoes it', async () => {
    // Samuel had no relatives; merged with Radha’s unnamed sibling he becomes Radha’s brother and Sanjay’s father.
    const user = userEvent.setup();
    const server = mockTreeServer();
    const { radhaSibling, sanjay, radha } = server.seed.people;
    const { router } = await renderApp(`/trees/${TREE_ID}/people/${radhaSibling.id}/merge`);
    await screen.findByRole('heading', { level: 2, name: /^Merge .+ with someone$/ });
    await user.type(screen.getByRole('searchbox', { name: 'Find the duplicate' }), 'samuel');
    await user.click(screen.getByRole('link', { name: /Samuel Osei/ }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/\/merge\/[0-9a-f-]+$/));
    await screen.findByRole('group', { name: 'Which record should stay?' });
    await user.click(screen.getByRole('radio', { name: /^Samuel Osei/ }));
    expect(screen.getByText(/No details conflict/)).toBeInTheDocument();
    await expectNoAxeViolations();
    await user.click(screen.getByRole('button', { name: 'Merge into Samuel Osei' }));
    await waitFor(() => expect(server.changes).toHaveLength(1));
    const graph = server.graph();
    expect(graph.people.some((person) => person.id === radhaSibling.id)).toBe(false);
    expect(resolveKinship(graph, server.seed.people.samuel.id, sanjay.id).label).toBe('Son');
    expect(resolveKinship(graph, radha.id, server.seed.people.samuel.id).label).toBe('Brother');
    const toast = await findToast(/Merged .+ into Samuel Osei/);
    await user.click(within(toast).getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(server.graph().people.some((person) => person.id === radhaSibling.id)).toBe(true));
  }, 60_000);

  it('resolves conflicting details field by field', async () => {
    const user = userEvent.setup();
    const server = mockTreeServer();
    const { dev, diya } = server.seed.people;
    await renderApp(`/trees/${TREE_ID}/people/${dev.id}/merge/${diya.id}`);
    const firstName = await screen.findByRole('group', { name: 'First name' });
    expect(screen.getByRole('heading', { name: /details differ — choose which to keep/ })).toBeInTheDocument();
    await user.click(within(firstName).getByRole('radio', { name: /^Diya/ }));
    await user.click(screen.getByRole('button', { name: 'Merge into Dev Sharma' }));
    await waitFor(() => expect(server.changes).toHaveLength(1));
    const kept = server.graph().people.find((person) => person.id === dev.id);
    expect(kept).toMatchObject({ firstName: 'Diya', lastName: 'Sharma', gender: 'male' });
    expect(server.graph().people.some((person) => person.id === diya.id)).toBe(false);
  }, 60_000);

  it('warns when a second set of birth parents can’t be carried over', async () => {
    const server = mockTreeServer();
    const { radhaSibling, kiran } = server.seed.people;
    await renderApp(`/trees/${TREE_ID}/people/${kiran.id}/merge/${radhaSibling.id}`);
    expect(await screen.findByText('Some links can’t be carried over:')).toBeInTheDocument();
    expect(screen.getByText('Radha’s parent — unnamed won’t be linked as birth parents: a person can have only one set of birth parents. Add them again under Relationships as another kind if that’s right.')).toBeInTheDocument();
  });
});
