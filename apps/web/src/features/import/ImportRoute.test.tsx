import { writeGedcom } from '@kinfolk/shared/gedcom/gedcom';
import { buildSeedTree } from '@kinfolk/shared/fixtures/seedTree';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../../test/axe';
import { renderApp } from '../../test/renderApp';
import { TREE_ID } from '../../test/treeFixtures';
import { mockTreeServer } from '../../test/treeServer';

const file = (name: string, text: string, type = 'text/plain') => new File([text], name, { type });

const CSV = [
  'First name,Last name,Sex,Date of birth,Father,Mother,Email',
  'Bala,Menon,M,1950-02-03,,,bala@example.com',
  'Uma,Menon,F,1955,,,',
  'Deepa,Menon,F,1980-07-01,Bala Menon,Uma Menon,',
  ',Nameless,,,,,',
  'Ravi,Sharma,M,1988-04-12,,,',
].join('\n');

const fileInput = (container: HTMLElement) => container.ownerDocument.querySelector('input[type="file"]') as HTMLInputElement;

describe('importing people (SPEC §5.3)', () => {
  it('maps spreadsheet columns, previews every row, and imports as one undoable change', async () => {
    const user = userEvent.setup();
    const server = mockTreeServer();
    const { container } = await renderApp(`/trees/${TREE_ID}/import`);
    await screen.findByRole('heading', { level: 2, name: 'Import people' });
    await user.upload(fileInput(container), file('family.csv', CSV, 'text/csv'));

    expect(await screen.findByText(/3 to add · 1 already here · 1 can’t be used · 2 relationships linked/)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'First name' })).toHaveValue('0');
    expect(screen.getByRole('combobox', { name: 'Father’s name' })).toHaveValue('4');
    expect(screen.getByRole('combobox', { name: 'Notes' })).toHaveValue('');
    const preview = screen.getByRole('list', { name: 'Import preview' });
    expect(within(preview).getByText('Nameless')).toBeInTheDocument();
    expect(preview).toHaveTextContent('No first name in this row, so there’s nobody to add.');
    expect(preview).toHaveTextContent('Already in this tree — left exactly as it is.');
    await expectNoAxeViolations();

    // Changing a mapping changes the preview.
    await user.selectOptions(screen.getByRole('combobox', { name: 'Last name' }), '');
    await waitFor(() => expect(screen.getByRole('list', { name: 'Import preview' })).toHaveTextContent('Bala'));

    await user.selectOptions(screen.getByRole('combobox', { name: 'Last name' }), '1');
    await user.click(screen.getByRole('button', { name: 'Import into Sharma family' }));
    await waitFor(() => expect(server.changes).toHaveLength(1));
    expect(server.changes[0]?.description).toBe('Imported 3 people from family.csv');
    const graph = server.graph();
    expect(graph.people.some((person) => person.firstName === 'Bala')).toBe(true);
    const deepa = graph.people.find((person) => person.firstName === 'Deepa');
    const bala = graph.people.find((person) => person.firstName === 'Bala');
    expect(deepa && bala && graph.parentChildren.some((edge) => edge.childId === deepa.id)).toBe(true);
    expect(await screen.findByRole('button', { name: 'Undo: Imported 3 people from family.csv' })).toBeInTheDocument();
  }, 60_000);

  it('reads a GEDCOM file and says what it can’t use', async () => {
    const user = userEvent.setup();
    const server = mockTreeServer();
    const other = buildSeedTree({ namespace: 0x9100 });
    const ged = `${writeGedcom(other.graph, { treeName: 'Imported family' })}0 @X1@ _CUSTOM\n`;
    const { container } = await renderApp(`/trees/${TREE_ID}/import`);
    await screen.findByRole('heading', { level: 2, name: 'Import people' });
    await user.upload(fileInput(container), file('cousins.ged', ged));
    expect(await screen.findByText(`${other.graph.people.length} people, ${other.graph.unions.length} families, and ${other.graph.parentChildren.length} parent links will be added to “Sharma family”.`)).toBeInTheDocument();
    expect(screen.getByText('Records of type _CUSTOM aren’t supported and were left out.')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'First name' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Import into Sharma family' }));
    await waitFor(() => expect(server.changes).toHaveLength(1));
    expect(server.changes[0]?.description).toBe(`Imported ${other.graph.people.length} people from cousins.ged`);
    expect(server.graph().people.length).toBeGreaterThan(other.graph.people.length);
  }, 60_000);

  it('explains a file it can’t read at all, and refuses editing to viewers', async () => {
    const user = userEvent.setup();
    mockTreeServer();
    const { container } = await renderApp(`/trees/${TREE_ID}/import`);
    await screen.findByRole('heading', { level: 2, name: 'Import people' });
    await user.upload(fileInput(container), file('notes.txt', 'just some words\nwith no columns'));
    expect(await screen.findByText(/We couldn’t find a first-name column/)).toBeInTheDocument();

    mockTreeServer({ tree: { role: 'viewer' } });
    await renderApp(`/trees/${TREE_ID}/import`);
    expect(await screen.findByRole('heading', { name: 'Editing isn’t available' })).toBeInTheDocument();
  }, 60_000);
});
