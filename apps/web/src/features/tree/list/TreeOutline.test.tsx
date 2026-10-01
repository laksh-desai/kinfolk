import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../../../test/axe';
import { renderApp } from '../../../test/renderApp';
import { TREE_ID } from '../../../test/treeFixtures';
import { mockTreeServer } from '../../../test/treeServer';

describe('list view (SPEC §5.3 accessible parallel view)', () => {
  it('lists everyone by generation and family, with the same actions as the canvas', async () => {
    const user = userEvent.setup();
    const server = mockTreeServer();
    const { ravi, suresh } = server.seed.people;
    const { router } = await renderApp(`/trees/${TREE_ID}?view=list`);
    const list = await screen.findByRole('region', { name: 'Family tree list' });
    expect(screen.queryByRole('region', { name: 'Family tree canvas' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'List' })).toHaveAttribute('aria-current', 'page');
    expect(within(list).getByRole('heading', { level: 2, name: 'Generation 1 — oldest' })).toBeInTheDocument();
    const people = within(list)
      .getAllByRole('link')
      .filter((link) => /\/people\/[^/]+$/.test(link.getAttribute('href') ?? '') && link.closest('li')?.querySelector('p') !== null);
    expect(new Set(people.map((link) => link.getAttribute('href'))).size).toBeGreaterThanOrEqual(server.graph().people.length);
    const sureshFamily = within(list).getByRole('heading', { level: 3, name: 'Family of Suresh Sharma' }).closest('li') as HTMLElement;
    expect(sureshFamily).toHaveTextContent('Children: Maya Sharma, Leo Okonkwo');
    expect(within(list).getByRole('link', { name: 'Edit Ravi Sharma' }).closest('li')).toHaveTextContent(/Focus person · Age \d\d/);
    await expectNoAxeViolations();

    await user.click(within(list).getByRole('link', { name: 'Edit Ravi Sharma' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/trees/${TREE_ID}/people/${ravi.id}/edit`));
    // The list stays while working on a person, even though the URL no longer names the view.
    expect(screen.getByRole('region', { name: 'Family tree list' })).toBeInTheDocument();
    await user.click(await screen.findByRole('link', { name: 'Back to Ravi Sharma' }));
    await user.click(within(screen.getByRole('region', { name: 'Family tree list' })).getByRole('button', { name: 'Delete Suresh Sharma' }));
    expect(await screen.findByRole('dialog', { name: 'Delete Suresh Sharma?' })).toBeInTheDocument();
    expect(suresh).toBeDefined();
  }, 60_000);

  it('switches back to the tree view and remembers the choice', async () => {
    const user = userEvent.setup();
    mockTreeServer();
    await renderApp(`/trees/${TREE_ID}?view=list`);
    await user.click(await screen.findByRole('link', { name: 'Tree' }));
    expect(await screen.findByRole('region', { name: 'Family tree canvas' })).toBeInTheDocument();
    mockTreeServer();
    await renderApp(`/trees/${TREE_ID}`);
    expect((await screen.findAllByRole('region', { name: 'Family tree canvas' })).length).toBeGreaterThan(0);
  }, 60_000);

  it('searches the list: matching people stay, the rest go, and choosing one lands on their row', async () => {
    const user = userEvent.setup();
    const server = mockTreeServer();
    const { router } = await renderApp(`/trees/${TREE_ID}?view=list`);
    const list = await screen.findByRole('region', { name: 'Family tree list' });
    await user.click(screen.getByRole('button', { name: 'Find a person' }));
    const input = await screen.findByRole('combobox', { name: 'Find a person by name' });
    await user.type(input, 'pillai');
    expect(await screen.findByRole('status', { name: 'Search results' })).toHaveTextContent(/^\d+ of \d+ people match$/);
    expect(within(list).getAllByRole('link', { name: /Pillai/ }).length).toBeGreaterThan(0);
    expect(within(list).queryByRole('link', { name: 'Ravi Sharma' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: /Ishaan Pillai/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/trees/${TREE_ID}/people/${server.seed.people.ishaan.id}`));
    // The search is done: the whole list is back and the chosen person is the current row.
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    // His own row is current (he is also listed as a child under his parents) and holds focus.
    const after = await screen.findByRole('region', { name: 'Family tree list' });
    await waitFor(() => {
      const row = within(after)
        .getAllByRole('link', { name: 'Ishaan Pillai' })
        .find((link) => link.getAttribute('aria-current') === 'true');
      expect(row).toBeDefined();
      expect(row).toHaveFocus();
    });
    expect(within(after).getAllByRole('link', { name: 'Ravi Sharma' }).length).toBeGreaterThan(0);
    await expectNoAxeViolations();
  }, 60_000);

  it('offers viewers the list without edit actions', async () => {
    mockTreeServer({ tree: { role: 'viewer' } });
    await renderApp(`/trees/${TREE_ID}?view=list`);
    const list = await screen.findByRole('region', { name: 'Family tree list' });
    expect(within(list).getAllByRole('link', { name: 'Ravi Sharma' }).length).toBeGreaterThan(0);
    expect(within(list).queryByRole('link', { name: /^Edit / })).not.toBeInTheDocument();
    expect(within(list).queryByRole('button', { name: /^Delete / })).not.toBeInTheDocument();
  });
});
