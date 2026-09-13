import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../test/axe';
import { mockApi, testUser } from '../test/mockApi';
import { renderApp } from '../test/renderApp';
import { seedResponse, TREE_ID, treeDto } from '../test/treeFixtures';

function mockTree(body: unknown) {
  return mockApi({
    'GET /api/auth/me': () => ({ body: { user: testUser } }),
    [`GET /api/trees/${TREE_ID}/graph`]: () => ({ body }),
  });
}

async function openSeedTree(path = `/trees/${TREE_ID}`) {
  const { seed, body } = seedResponse();
  mockTree(body);
  const view = await renderApp(path);
  await screen.findByRole('region', { name: 'Family tree canvas' });
  return { ...view, seed };
}

describe('tree canvas', () => {
  it('renders every person as a named card, with the tree name as page title', async () => {
    const { seed } = await openSeedTree();
    expect(screen.getByRole('heading', { level: 1, name: 'Sharma family' })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Sharma family · Kinfolk'));
    const canvas = screen.getByRole('region', { name: 'Family tree canvas' });
    expect(within(canvas).getByRole('button', { name: 'Ravi Sharma, Self, focus person' })).toBeInTheDocument();
    expect(within(canvas).getByRole('button', { name: 'Sita Sharma, Paternal grandmother' })).toBeInTheDocument();
    expect(within(canvas).getByRole('button', { name: 'Radha’s parent — unnamed, Grandparent-in-law' })).toBeInTheDocument();
    const cards = within(canvas).getAllByRole('button').filter((button) => button.dataset.personId);
    expect(cards).toHaveLength(seed.graph.people.length);
  });

  it('shows dates and death, never a bare age, on cards', async () => {
    const { seed } = await openSeedTree();
    const mohan = screen.getByRole('button', { name: /^Mohan Sharma/ });
    expect(mohan).toHaveAccessibleDescription(/Deceased\. 1935–2005/);
    expect(screen.getByRole('button', { name: /^Ravi Sharma/ })).toHaveAccessibleDescription(/b\. 1988/);
    expect(seed.people.mohan.lifeStatus).toBe('deceased');
  });

  it('names every toolbar control and shows the zoom level', async () => {
    await openSeedTree();
    const toolbar = screen.getByRole('toolbar', { name: 'Canvas controls' });
    for (const name of ['Find a person', 'Zoom out', 'Zoom in', 'Reset zoom to 100%', 'Fit the whole tree on screen', 'Family branches', 'Legend']) {
      expect(within(toolbar).getByRole('button', { name })).toBeInTheDocument();
    }
    expect(within(toolbar).getByLabelText('Zoom level')).toHaveTextContent(/\d+%/);
  });

  it('zooms with the buttons and resets to 100%', async () => {
    const user = userEvent.setup();
    await openSeedTree();
    const level = screen.getByLabelText('Zoom level');
    await user.click(screen.getByRole('button', { name: 'Reset zoom to 100%' }));
    expect(level).toHaveTextContent('100%');
    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(level).toHaveTextContent('110%');
    await user.click(screen.getByRole('button', { name: 'Zoom out' }));
    await user.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(level).toHaveTextContent('90%');
  });

  it('selects a card, opens the details panel at a restorable URL, and Escape clears it', async () => {
    const user = userEvent.setup();
    const { router, seed } = await openSeedTree();
    await user.click(screen.getByRole('button', { name: /^Sita Sharma/ }));
    expect(router.state.location.pathname).toBe(`/trees/${TREE_ID}/people/${seed.people.sita.id}`);
    const panel = await screen.findByRole('complementary', { name: 'Sita Sharma' });
    expect(within(panel).getByText('Paternal grandmother')).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Sita Sharma · Sharma family · Kinfolk'));

    screen.getByRole('button', { name: /^Sita Sharma/ }).focus();
    await user.keyboard('{Escape}');
    expect(router.state.location.pathname).toBe(`/trees/${TREE_ID}`);
    expect(screen.queryByRole('complementary', { name: 'Sita Sharma' })).not.toBeInTheDocument();
  });

  it('restores the selected person straight from a pasted URL', async () => {
    const { seed } = seedResponse();
    mockTree(seedResponse().body);
    await renderApp(`/trees/${TREE_ID}/people/${seed.people.ishaan.id}`);
    const panel = await screen.findByRole('complementary', { name: 'Ishaan Pillai' });
    expect(within(panel).getByText('Second cousin once removed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Ishaan Pillai/ })).toHaveAttribute('aria-current', 'true');
  });

  it('moves the selection along relationships with the arrow keys, with a single tab stop', async () => {
    const user = userEvent.setup();
    const { router, seed } = await openSeedTree(`/trees/${TREE_ID}/people/${seedResponse().seed.people.ravi.id}`);
    const ravi = screen.getByRole('button', { name: /^Ravi Sharma/ });
    const tabStops = screen.getAllByRole('button').filter((button) => button.dataset.personId && button.tabIndex === 0);
    expect(tabStops).toEqual([ravi]);
    ravi.focus();
    await user.keyboard('{ArrowUp}');
    await waitFor(() => expect([seed.people.vikram.id, seed.people.nisha.id].some((id) => router.state.location.pathname.endsWith(id))).toBe(true));
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(router.state.location.pathname.endsWith(seed.people.ravi.id)).toBe(true));
    await user.keyboard('{ArrowRight}');
    await waitFor(() => expect(router.state.location.pathname.endsWith(seed.people.ravi.id)).toBe(false));
  });

  it('finds a person with "/" search and selects them', async () => {
    const user = userEvent.setup();
    const { router, seed } = await openSeedTree();
    screen.getByRole('button', { name: /^Ravi Sharma/ }).focus();
    await user.keyboard('/');
    const input = await screen.findByRole('combobox', { name: 'Find a person by name' });
    expect(input).toHaveFocus();
    await user.type(input, 'ishaan');
    expect(screen.getByRole('option', { name: /Ishaan Pillai/ })).toBeInTheDocument();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(router.state.location.pathname).toBe(`/trees/${TREE_ID}/people/${seed.people.ishaan.id}`));
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('says so when search matches no one', async () => {
    const user = userEvent.setup();
    await openSeedTree();
    await user.click(screen.getByRole('button', { name: 'Find a person' }));
    await user.type(screen.getByRole('combobox'), 'zzzz');
    expect(screen.getByText('No one in this tree matches “zzzz”.')).toHaveAttribute('role', 'status');
  });

  it('collapses and expands a branch from the panel, with a named expand chip on the card', async () => {
    const user = userEvent.setup();
    const { seed } = await openSeedTree(`/trees/${TREE_ID}/people/${seedResponse().seed.people.vikram.id}`);
    await user.click(await screen.findByRole('button', { name: 'Hide descendants' }));
    expect(screen.queryByRole('button', { name: /^Ravi Sharma/ })).not.toBeInTheDocument();
    const chip = screen.getByRole('button', { name: /^Show \d+ hidden relatives of Vikram Sharma$/ });
    await user.click(chip);
    expect(screen.getByRole('button', { name: /^Ravi Sharma/ })).toBeInTheDocument();
    expect(seed.people.ravi).toBeDefined();
  });

  it('shows the overview map only for trees with more than 25 people', async () => {
    const { container } = await openSeedTree();
    expect(container.querySelector('svg.cursor-pointer')).not.toBeNull();

    const small = seedResponse();
    const few = { ...small.body, graph: { ...small.body.graph, people: small.body.graph.people.slice(0, 1), unions: [], parentChildren: [] } };
    mockTree(few);
    const second = await renderApp(`/trees/${TREE_ID}`);
    await screen.findAllByRole('region', { name: 'Family tree canvas' });
    expect(second.container.querySelector('svg.cursor-pointer')).toBeNull();
  });

  it('marks married-in branches with a label, and the toggle hides them', async () => {
    const user = userEvent.setup();
    await openSeedTree();
    expect(screen.getByText('Nair family (married in)')).toBeInTheDocument();
    // Ravi's maternal grandparents are blood relatives, not married in.
    expect(screen.queryByText('Rao family (married in)')).not.toBeInTheDocument();
    // A separate family that isn't linked yet hasn't married into anything.
    expect(screen.queryByText('Walker family (married in)')).not.toBeInTheDocument();
    expect(screen.queryByText('Osei family (married in)')).not.toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: 'Family branches' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await user.click(toggle);
    expect(screen.queryByText('Nair family (married in)')).not.toBeInTheDocument();
  });

  it('explains an empty tree instead of showing a blank box', async () => {
    mockTree({ tree: treeDto(), graph: { people: [], unions: [], parentChildren: [], focusPersonId: null } });
    await renderApp(`/trees/${TREE_ID}`);
    expect(await screen.findByRole('heading', { name: 'No one in this family tree yet' })).toBeInTheDocument();
  });

  it('shows a helpful not-found page for a tree the user cannot see', async () => {
    mockApi({
      'GET /api/auth/me': () => ({ body: { user: testUser } }),
      [`GET /api/trees/${TREE_ID}/graph`]: () => ({ status: 404, body: { error: { code: 'tree_not_found', message: 'Not found' } } }),
    });
    await renderApp(`/trees/${TREE_ID}`);
    expect(await screen.findByRole('heading', { name: 'We can’t find that page' })).toBeInTheDocument();
  });

  it('pans by dragging the background', async () => {
    await openSeedTree();
    const canvas = screen.getByRole('region', { name: 'Family tree canvas' });
    const layer = canvas.querySelector<HTMLDivElement>('.will-change-transform')!;
    const before = layer.style.transform;
    act(() => {
      fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 180, clientY: 140 });
      fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 180, clientY: 140 });
    });
    expect(layer.style.transform).not.toBe(before);
  });

  it('has no axe violations with the panel open', async () => {
    await openSeedTree(`/trees/${TREE_ID}/people/${seedResponse().seed.people.ravi.id}`);
    await screen.findByRole('complementary', { name: 'Ravi Sharma' });
    await expectNoAxeViolations();
  }, 60_000);
});
