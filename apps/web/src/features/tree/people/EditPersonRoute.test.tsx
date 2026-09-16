import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../../../test/axe';
import { renderApp } from '../../../test/renderApp';
import { TREE_ID } from '../../../test/treeFixtures';
import { mockTreeServer } from '../../../test/treeServer';

describe('editing a person (SPEC §5.4)', () => {
  it('says "Edit" and whose details, restores from the URL, and has no axe violations', async () => {
    const server = mockTreeServer();
    await renderApp(`/trees/${TREE_ID}/people/${server.seed.people.ravi.id}/edit`);
    expect(await screen.findByRole('heading', { level: 2, name: 'Edit Ravi’s details' })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Edit Ravi Sharma’s details · Sharma family · Kinfolk'));
    expect(screen.queryByText(/Add their details|Let’s add/i)).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'First name' })).toHaveValue('Ravi');
    expect(screen.getByRole('textbox', { name: 'Year' })).toHaveValue('1988');
    expect(screen.getByRole('textbox', { name: /^Address/ })).toHaveValue('12 Alder Street, Portland, OR 97205, USA');
    // Without a Places key the address is plain text, and says so.
    expect(screen.getByText('Type the full address as you’d write it on an envelope.')).toBeInTheDocument();
    await expectNoAxeViolations();
  }, 60_000);

  it('focuses, shows, and announces the first invalid field on a failed save', async () => {
    const user = userEvent.setup();
    const server = mockTreeServer();
    await renderApp(`/trees/${TREE_ID}/people/${server.seed.people.ravi.id}/edit`);
    const firstName = await screen.findByRole('textbox', { name: 'First name' });
    await user.clear(firstName);
    await user.type(screen.getByRole('textbox', { name: /^Email/ }), '-not-an-email');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(firstName).toHaveFocus());
    expect(firstName).toHaveAccessibleDescription('Enter a first name.');
    await waitFor(() => expect(screen.getByTestId('live-assertive')).toHaveTextContent('2 fields need attention. First name: Enter a first name. Email: Enter an email address like name@example.com.'));
    expect(server.changes).toHaveLength(0);
  }, 60_000);

  it('saves only what changed, as one undoable edit, and returns to the details panel', async () => {
    const user = userEvent.setup();
    const server = mockTreeServer();
    const { ravi } = server.seed.people;
    const { router } = await renderApp(`/trees/${TREE_ID}/people/${ravi.id}/edit`);
    const nickname = await screen.findByRole('textbox', { name: /^Nickname/ });
    await user.type(nickname, 'Rav');
    await user.type(screen.getByRole('textbox', { name: 'Day' }), '{Backspace}{Backspace}13');
    await user.click(screen.getByRole('checkbox', { name: 'This date is approximate' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/trees/${TREE_ID}/people/${ravi.id}`));
    await waitFor(() => expect(server.changes).toHaveLength(1));
    expect(server.changes[0]).toEqual({
      description: 'Edited Ravi’s details',
      ops: [{ op: 'person.update', id: ravi.id, patch: { nickname: 'Rav', birthDate: { year: 1988, month: 4, day: 13, approximate: true } } }],
    });
    const undo = await screen.findByRole('button', { name: 'Undo: Edited Ravi’s details' });
    await user.click(undo);
    await waitFor(() => expect(server.changes).toHaveLength(2));
    expect(server.graph().people.find((person) => person.id === ravi.id)?.nickname).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Redo: Edited Ravi’s details' }));
    await waitFor(() => expect(server.graph().people.find((person) => person.id === ravi.id)?.nickname).toBe('Rav'));
  }, 60_000);

  it('asks before leaving with unsaved changes, and stays when asked to', async () => {
    const user = userEvent.setup();
    const server = mockTreeServer();
    const { ravi } = server.seed.people;
    const { router } = await renderApp(`/trees/${TREE_ID}/people/${ravi.id}/edit`);
    await user.type(await screen.findByRole('textbox', { name: /^Profession/ }), ' and painter');
    await user.click(screen.getByRole('link', { name: 'Back to Ravi Sharma' }));
    const dialog = await screen.findByRole('dialog', { name: 'Leave without saving?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(router.state.location.pathname).toBe(`/trees/${TREE_ID}/people/${ravi.id}/edit`);
    expect(screen.getByRole('textbox', { name: /^Profession/ })).toHaveValue('Architect and painter');
    await user.click(screen.getByRole('link', { name: 'Cancel' }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Leave without saving?' })).getByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/trees/${TREE_ID}/people/${ravi.id}`));
    expect(server.changes).toHaveLength(0);
  }, 60_000);

  it('names a placeholder, which makes them a regular person', async () => {
    const user = userEvent.setup();
    const server = mockTreeServer();
    const { radhaParent } = server.seed.people;
    await renderApp(`/trees/${TREE_ID}/people/${radhaParent.id}/edit`);
    expect(await screen.findByRole('heading', { level: 2, name: 'Edit details for Radha’s parent — unnamed' })).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'First name' }), 'Kala');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(server.changes).toHaveLength(1));
    expect(server.graph().people.find((person) => person.id === radhaParent.id)).toMatchObject({ firstName: 'Kala', isPlaceholder: false });
  }, 60_000);

  it('uploads a photo and attaches it as an undoable change', async () => {
    const user = userEvent.setup();
    const server = mockTreeServer();
    const { ravi } = server.seed.people;
    const photoUrl = `/api/files/trees/${TREE_ID}/people/${ravi.id}/photo.webp`;
    server.api.set(`POST /api/trees/${TREE_ID}/people/${ravi.id}/photo/upload-target`, () => ({ body: { key: 'uploads/raw/u/1', url: '/api/uploads/grant', method: 'PUT', headers: { 'content-type': 'image/png' } } }));
    server.api.set('PUT /api/uploads/grant', () => ({ status: 204 }));
    server.api.set(`POST /api/trees/${TREE_ID}/people/${ravi.id}/photo`, () => ({ body: { photoUrl } }));
    const { container } = await renderApp(`/trees/${TREE_ID}/people/${ravi.id}/edit`);
    await screen.findByRole('button', { name: 'Add a photo' });
    const input = container.ownerDocument.querySelector<HTMLInputElement>('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File([new Uint8Array([137, 80, 78, 71])], 'ravi.png', { type: 'image/png' }));
    await waitFor(() => expect(server.changes).toHaveLength(1));
    expect(server.changes[0]).toEqual({ description: 'Changed Ravi Sharma’s photo', ops: [{ op: 'person.update', id: ravi.id, patch: { photoUrl } }] });
    expect(await screen.findByRole('button', { name: 'Change photo' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Ravi Sharma' })).toHaveAttribute('src', photoUrl);
  }, 60_000);

  it('refuses a file that isn’t an image, visibly', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const server = mockTreeServer();
    const { container } = await renderApp(`/trees/${TREE_ID}/people/${server.seed.people.ravi.id}/edit`);
    await screen.findByRole('button', { name: 'Add a photo' });
    const input = container.ownerDocument.querySelector<HTMLInputElement>('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(['hello'], 'notes.txt', { type: 'text/plain' }));
    const alert = (await screen.findByText('Choose a JPEG, PNG, or WebP image.', { selector: 'p' })).closest('[tabindex="-1"]');
    await waitFor(() => expect(alert).toHaveFocus());
    // Focusing the alert reads it out; announcing it as well would say it twice.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.getByTestId('live-assertive')).toBeEmptyDOMElement();
    expect(server.changes).toHaveLength(0);
  }, 60_000);
});
