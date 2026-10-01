import { resolveKinship } from '@kinfolk/shared/kinship/resolveKinship';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../../../test/axe';
import { renderApp } from '../../../test/renderApp';
import { TREE_ID } from '../../../test/treeFixtures';
import { findToast, mockTreeServer } from '../../../test/treeServer';

const canvas = () => screen.getByRole('region', { name: 'Family tree canvas' });

describe('adding relatives (SPEC §4.1, §4.2)', () => {
  it('shows the four primitives on every person, including a detached one, and no edit actions to viewers', async () => {
    const server = mockTreeServer();
    await renderApp(`/trees/${TREE_ID}/people/${server.seed.people.samuel.id}`);
    const panel = await screen.findByRole('complementary', { name: 'Samuel Osei' });
    for (const name of ['Add parent', 'Add partner', 'Add child', 'Add sibling']) expect(within(panel).getByRole('link', { name })).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: /More relatives/ })).toBeInTheDocument();
    await expectNoAxeViolations();
  }, 60_000);

  it('renders no edit affordances at all for viewers (SPEC §2: absent, not disabled)', async () => {
    const viewer = mockTreeServer({ tree: { role: 'viewer' } });
    await renderApp(`/trees/${TREE_ID}/people/${viewer.seed.people.samuel.id}`);
    const readOnly = await screen.findByRole('complementary', { name: 'Samuel Osei' });
    expect(within(readOnly).queryByRole('link', { name: 'Add parent' })).not.toBeInTheDocument();
    expect(within(readOnly).queryByRole('link', { name: 'Edit details' })).not.toBeInTheDocument();
    expect(within(readOnly).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(within(readOnly).getByRole('link', { name: 'Compare' })).toBeInTheDocument();
  }, 60_000);

  it('adds a cousin to someone with no relatives, explains the placeholders, and undoes it', async () => {
    const user = userEvent.setup();
    const server = mockTreeServer();
    const samuel = server.seed.people.samuel;
    const { router } = await renderApp(`/trees/${TREE_ID}/people/${samuel.id}/add/cousin`);
    await screen.findByRole('heading', { name: 'Add a cousin' });
    await waitFor(() => expect(document.title).toBe('Add cousin · Samuel Osei · Sharma family · Kinfolk'));
    expect(screen.getByText(/To connect them, this also adds an unnamed parent for Samuel, an unnamed parent for that parent and an unnamed sibling for that parent/)).toBeInTheDocument();
    const firstName = screen.getByRole('textbox', { name: 'First name' });
    await waitFor(() => expect(firstName).toHaveFocus());
    await user.type(firstName, 'Maya');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Gender' }), 'female');
    await user.click(screen.getByRole('textbox', { name: 'Year optional' }));
    await user.keyboard('{Enter}');

    // Optimistic: on the canvas and in the panel before the server answers.
    await waitFor(() => expect(router.state.location.pathname).toMatch(new RegExp(`/trees/${TREE_ID}/people/[0-9a-f-]{36}$`)));
    expect(within(canvas()).getByRole('button', { name: /^Maya, / })).toBeInTheDocument();
    await waitFor(() => expect(server.changes).toHaveLength(1));
    const mayaId = router.state.location.pathname.split('/').at(-1) as string;
    expect(resolveKinship(server.graph(), samuel.id, mayaId).label).toBe('First cousin');
    expect(server.graph().people.filter((person) => person.isPlaceholder)).toHaveLength(2 + 3);

    const toast = await findToast(/Added Maya as Samuel’s cousin\. To connect her/);
    expect(screen.getByTestId('live-polite')).toHaveTextContent(/Added Maya as Samuel’s cousin/);
    await user.click(within(toast).getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(server.changes).toHaveLength(2));
    await waitFor(() => expect(within(canvas()).queryByRole('button', { name: /^Maya, / })).not.toBeInTheDocument());
    expect(server.graph().people.some((person) => person.id === mayaId)).toBe(false);
    expect(server.graph().people.filter((person) => person.isPlaceholder)).toHaveLength(2);
  }, 60_000);

  it('makes a spouse the second parent of the children already there, or a step-parent when told', async () => {
    const user = userEvent.setup();
    const server = mockTreeServer();
    const { suresh, maya } = server.seed.people;
    const { router } = await renderApp(`/trees/${TREE_ID}/people/${suresh.id}/add/partner`);
    await screen.findByRole('heading', { name: 'Add a partner or spouse' });

    // "No" first: a later partner who isn't their parent stays a step-parent.
    const question = await screen.findByRole('group', { name: 'Is this person also a parent of Maya Sharma and Leo Okonkwo?' });
    expect(within(question).getByRole('radio', { name: 'Yes — their other parent' })).toBeChecked();
    await user.click(within(question).getByRole('radio', { name: 'No — a separate family' }));
    await user.type(screen.getByRole('textbox', { name: 'First name' }), 'Rina');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Gender' }), 'female');
    await user.click(screen.getByRole('button', { name: 'Add partner or spouse' }));
    await waitFor(() => expect(server.changes).toHaveLength(1));
    const rinaId = router.state.location.pathname.split('/').at(-1) as string;
    expect(resolveKinship(server.graph(), maya.id, rinaId).label).toBe('Step-mother');
    await screen.findByRole('complementary', { name: 'Rina' });

    // The default answer makes the new spouse the children's second parent.
    await router.navigate(`/trees/${TREE_ID}/people/${suresh.id}/add/partner`);
    const second = await screen.findByRole('group', { name: /Is this person also a parent of/ });
    expect(within(second).getByRole('radio', { name: 'Yes — their other parent' })).toBeChecked();
    await user.type(await screen.findByRole('textbox', { name: 'First name' }), 'Kala');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Gender' }), 'female');
    await user.click(screen.getByRole('button', { name: 'Add partner or spouse' }));
    await waitFor(() => expect(server.changes).toHaveLength(2));
    const kalaId = router.state.location.pathname.split('/').at(-1) as string;
    expect(resolveKinship(server.graph(), maya.id, kalaId).label).toBe('Adoptive mother');
    await findToast(/Added Kala as Suresh’s wife\. She is also recorded as a parent of Maya and Leo\./);
  }, 60_000);

  it('asks which parent’s side and which aunt or uncle, and can connect through someone not yet entered', async () => {
    const user = userEvent.setup();
    const server = mockTreeServer();
    const { ravi, nisha, kiran } = server.seed.people;
    await renderApp(`/trees/${TREE_ID}/people/${ravi.id}/add/cousin`);
    const side = await screen.findByRole('group', { name: 'On which parent’s side?' });
    await user.click(within(side).getByRole('radio', { name: 'Nisha Sharma' }));
    const whose = screen.getByRole('group', { name: 'Whose child are they?' });
    expect(within(whose).getByRole('radio', { name: 'Kiran Rao' })).toBeChecked();
    await user.click(within(whose).getByRole('radio', { name: /Someone not in the tree yet/ }));
    expect(screen.getByText(/this also adds an unnamed sibling for Nisha/)).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'First name' }), 'Tara');
    await user.click(screen.getByRole('button', { name: 'Add cousin' }));
    await waitFor(() => expect(server.changes).toHaveLength(1));
    const tara = server.graph().people.find((person) => person.firstName === 'Tara');
    expect(tara && resolveKinship(server.graph(), ravi.id, tara.id).label).toBe('First cousin');
    expect(tara && resolveKinship(server.graph(), kiran.id, tara.id).label).not.toBe('Daughter');
    expect(nisha).toBeDefined();
  }, 60_000);

  it('keeps the form open to add several siblings in a row', async () => {
    const user = userEvent.setup();
    const server = mockTreeServer();
    const { router } = await renderApp(`/trees/${TREE_ID}/people/${server.seed.people.samuel.id}/add/sibling`);
    // Siblings come in batches, so the form stays open by default: each one is a name and Enter.
    expect(await screen.findByRole('checkbox', { name: 'Add another sibling after this' })).toBeChecked();
    for (const name of ['Ama', 'Kojo', 'Esi']) {
      const field = screen.getByRole('textbox', { name: 'First name' });
      await user.type(field, name);
      await user.keyboard('{Enter}');
      await waitFor(() => expect(screen.getByRole('textbox', { name: 'First name' })).toHaveValue(''));
      await waitFor(() => expect(screen.getByRole('textbox', { name: 'First name' })).toHaveFocus());
    }
    expect(router.state.location.pathname).toBe(`/trees/${TREE_ID}/people/${server.seed.people.samuel.id}/add/sibling`);
    const addedSoFar = screen.getByRole('region', { name: 'Added so far' });
    expect(within(addedSoFar).getAllByRole('link').map((link) => link.textContent)).toEqual(['Ama Osei', 'Kojo Osei', 'Esi Osei']);
    // Closing now lands on the last person added, not back on Samuel.
    await user.click(screen.getByRole('button', { name: 'Close and return to Esi Osei' }));
    const esi = server.graph().people.find((person) => person.firstName === 'Esi');
    await waitFor(() => expect(router.state.location.pathname).toBe(`/trees/${TREE_ID}/people/${esi?.id}`));
    await waitFor(() => expect(server.changes).toHaveLength(3));
    for (const name of ['Ama', 'Kojo', 'Esi']) {
      const sibling = server.graph().people.find((person) => person.firstName === name);
      expect(sibling && resolveKinship(server.graph(), server.seed.people.samuel.id, sibling.id).label).toBe('Sibling');
    }
    // Siblings share the one placeholder parent created for the first.
    expect(server.graph().people.filter((person) => person.isPlaceholder)).toHaveLength(2 + 1);
    // The last name defaults from the person they're a sibling of.
    expect(server.graph().people.find((person) => person.firstName === 'Esi')?.lastName).toBe('Osei');
  }, 60_000);

  it('never submits silently: an empty name is focused, shown, and announced', async () => {
    const user = userEvent.setup();
    const server = mockTreeServer();
    await renderApp(`/trees/${TREE_ID}/people/${server.seed.people.ravi.id}/add/child`);
    await screen.findByRole('group', { name: 'Who is the child’s other parent?' });
    await user.click(screen.getByRole('button', { name: 'Add child' }));
    const firstName = screen.getByRole('textbox', { name: 'First name' });
    await waitFor(() => expect(firstName).toHaveFocus());
    expect(firstName).toHaveAccessibleDescription('Enter a first name.');
    await waitFor(() => expect(screen.getByTestId('live-assertive')).toHaveTextContent('One field needs attention. First name: Enter a first name.'));
    expect(server.changes).toHaveLength(0);
    await expectNoAxeViolations();
  }, 60_000);

  it('asks for another kind of parent when two birth parents are already recorded (QUESTIONS Q12)', async () => {
    const user = userEvent.setup();
    const server = mockTreeServer();
    await renderApp(`/trees/${TREE_ID}/people/${server.seed.people.ravi.id}/add/parent`);
    const kind = await screen.findByRole('group', { name: 'What kind of parent?' });
    await user.click(within(kind).getByRole('radio', { name: 'Step-parent' }));
    await user.type(screen.getByRole('textbox', { name: 'First name' }), 'Rosa');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Gender' }), 'female');
    await user.click(screen.getByRole('button', { name: 'Add parent' }));
    await waitFor(() => expect(server.changes).toHaveLength(1));
    const rosa = server.graph().people.find((person) => person.firstName === 'Rosa');
    expect(rosa && resolveKinship(server.graph(), server.seed.people.ravi.id, rosa.id).label).toBe('Step-mother');
  }, 60_000);

  it('lets an editing URL opened by a viewer explain itself instead of showing a form', async () => {
    const server = mockTreeServer({ tree: { role: 'viewer' } });
    await renderApp(`/trees/${TREE_ID}/people/${server.seed.people.ravi.id}/add/parent`);
    expect(await screen.findByRole('heading', { name: 'Editing isn’t available' })).toBeInTheDocument();
    expect(screen.getByText(/You can view this family tree but not change it/)).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'First name' })).not.toBeInTheDocument();
  });

  it('offers every §4.2 relationship from the picker, grouped', async () => {
    const user = userEvent.setup();
    const server = mockTreeServer();
    const { router } = await renderApp(`/trees/${TREE_ID}/people/${server.seed.people.hari.id}/add`);
    await screen.findByRole('heading', { name: 'Add a relative' });
    for (const name of ['Grandparent', 'Great-grandparent', 'Aunt or uncle', 'Niece or nephew', 'Cousin', 'Parent-in-law', 'Sibling-in-law', 'Child-in-law', 'Step-child', 'Half-sibling']) {
      expect(screen.getByRole('link', { name: new RegExp(`^${name}`) })).toBeInTheDocument();
    }
    await user.click(screen.getByRole('link', { name: /^Great-grandparent/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/trees/${TREE_ID}/people/${server.seed.people.hari.id}/add/great-grandparent`));
    await screen.findByRole('heading', { name: 'Add a great-grandparent' });
    await expectNoAxeViolations();
  }, 60_000);

  it('adds the first person to an empty tree and makes them the focus', async () => {
    const user = userEvent.setup();
    const server = mockTreeServer({ graph: { people: [], unions: [], parentChildren: [], focusPersonId: null } });
    const { router } = await renderApp(`/trees/${TREE_ID}`);
    await user.click(await screen.findByRole('link', { name: 'Add the first person' }));
    await screen.findByRole('heading', { name: 'Add the first person' });
    await user.type(screen.getByRole('textbox', { name: 'First name' }), 'Ravi');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(router.state.location.pathname).toMatch(/\/people\//));
    await waitFor(() => expect(server.changes).toHaveLength(1));
    expect(server.graph().focusPersonId).toBe(server.graph().people[0]?.id);
    expect(await screen.findByRole('button', { name: 'Ravi, Self, focus person' })).toBeInTheDocument();
  }, 60_000);
});
