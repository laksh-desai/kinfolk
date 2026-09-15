import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../test/renderApp';
import { treeDto, TREE_ID } from '../../test/treeFixtures';
import { mockTreeServer } from '../../test/treeServer';

const LINKED_TREE = '44444444-4444-4444-8444-444444444444';

function withLinkedPerson() {
  const seed = mockTreeServer();
  const kiran = seed.seed.people.kiran.id;
  const graph = { ...seed.graph(), people: seed.graph().people.map((person) => (person.id === kiran ? { ...person, linkedTreeId: LINKED_TREE } : person)) };
  seed.api.set(`GET /api/trees/${TREE_ID}/graph`, () => ({ body: { tree: treeDto({ focusPersonId: graph.focusPersonId }), graph } }));
  return { server: seed, kiran };
}

describe('a person whose own tree is linked (SPEC §5.5, §6.15)', () => {
  it('opens the linked tree with a way back', async () => {
    const user = userEvent.setup();
    const { server, kiran } = withLinkedPerson();
    server.api.set(`GET /api/trees/${LINKED_TREE}`, () => ({ body: { tree: treeDto({ id: LINKED_TREE, name: 'Rao family' }) } }));
    server.api.set(`GET /api/trees/${LINKED_TREE}/graph`, () => ({
      body: { tree: treeDto({ id: LINKED_TREE, name: 'Rao family', role: 'viewer' }), graph: { people: [], unions: [], parentChildren: [], focusPersonId: null } },
    }));
    const { router } = await renderApp(`/trees/${TREE_ID}/people/${kiran}`);
    const panel = await screen.findByRole('complementary', { name: 'Kiran Rao' });
    expect(await within(panel).findByRole('heading', { name: 'Linked family tree' })).toBeInTheDocument();
    await user.click(within(panel).getByRole('link', { name: 'Open Rao family' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/trees/${LINKED_TREE}`));
    const back = await screen.findByRole('link', { name: 'Back to Sharma family' });
    await user.click(back);
    await waitFor(() => expect(router.state.location.pathname).toBe(`/trees/${TREE_ID}/people/${kiran}`));
  }, 60_000);

  it('explains why it can’t be opened instead of showing a dead control', async () => {
    const { server, kiran } = withLinkedPerson();
    server.api.set(`GET /api/trees/${LINKED_TREE}`, () => ({ status: 404, body: { error: { code: 'tree_not_found', message: 'Not found' } } }));
    await renderApp(`/trees/${TREE_ID}/people/${kiran}`);
    const panel = await screen.findByRole('complementary', { name: 'Kiran Rao' });
    expect(await within(panel).findByText(/isn’t shared with you. Ask Kiran to give you access to open it/)).toBeInTheDocument();
    expect(within(panel).queryByRole('link', { name: /^Open / })).not.toBeInTheDocument();
  }, 60_000);
});
