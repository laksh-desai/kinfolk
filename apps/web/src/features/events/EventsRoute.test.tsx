import { keyEvents, type EventTree } from '@kinfolk/shared/events/keyEvents';
import { buildSeedTree } from '@kinfolk/shared/fixtures/seedTree';
import { toCalendarDay } from '@kinfolk/shared/dates/partialDate';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../../test/axe';
import { mockApi, testUser } from '../../test/mockApi';
import { renderApp } from '../../test/renderApp';
import { TREE_ID } from '../../test/treeFixtures';

const seed = buildSeedTree();
const tree: EventTree = { treeId: TREE_ID, treeName: 'Sharma family', people: seed.graph.people, unions: seed.graph.unions };
const events = keyEvents([tree], toCalendarDay(new Date()));

function eventsApi(body: unknown) {
  return mockApi({
    'GET /api/auth/me': () => ({ body: { user: testUser } }),
    'GET /api/trees': () => ({ body: { trees: [] } }),
    'GET /api/me/inbox': () => ({ body: { accessInvites: [], linkRequests: [], invitations: [], changeRequests: [] } }),
    'GET /api/events': () => ({ body }),
  });
}

describe('key events screen (SPEC §5.8, §6.4)', () => {
  it('fills every column from the seed tree — it is never empty when the dates are there', async () => {
    eventsApi({ events, needDates: [{ treeId: TREE_ID, treeName: 'Sharma family', count: 3 }] });
    await renderApp('/events');
    expect(await screen.findByRole('heading', { level: 1, name: 'Key events' })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Key events · Kinfolk'));
    const rows = within(await screen.findByRole('list', { name: 'Key events' })).getAllByRole('listitem');
    expect(rows.length).toBe(events.length);
    const first = rows[0] as HTMLElement;
    // Person, date, event type, tree, and days until — every column the old product left blank.
    expect(within(first).getAllByRole('link')[0]).toHaveAttribute('href', expect.stringContaining(`/trees/${TREE_ID}/people/`));
    expect(first.textContent).toMatch(/Birthday|Anniversary/);
    expect(first).toHaveTextContent('Sharma family');
    expect(first.textContent).toMatch(/\d{1,2} [A-Z][a-z]+ 20\d\d/);
    expect(first.textContent).toMatch(/Today|Tomorrow|In \d+ (days|weeks|months)|In a week/);
    expect(screen.getByRole('status')).toHaveTextContent(`${events.length} events in the year ahead`);
    expect(screen.getByRole('link', { name: '3 in Sharma family' })).toHaveAttribute('href', `/trees/${TREE_ID}/needs-detail`);
    await expectNoAxeViolations();
  }, 60_000);

  it('searches, filters by month, and sorts', async () => {
    const user = userEvent.setup();
    eventsApi({ events, needDates: [] });
    await renderApp('/events');
    await screen.findByRole('list', { name: 'Key events' });
    await user.type(screen.getByRole('searchbox', { name: 'Search people or trees' }), 'ravi');
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Key events' })).getAllByRole('listitem').length).toBeLessThan(events.length));
    expect(screen.getByRole('list', { name: 'Key events' })).toHaveTextContent('Ravi Sharma');
    await user.clear(screen.getByRole('searchbox', { name: 'Search people or trees' }));

    await user.selectOptions(screen.getByRole('combobox', { name: 'Month' }), '4');
    const april = within(screen.getByRole('list', { name: 'Key events' })).getAllByRole('listitem');
    expect(april.every((row) => /April/.test(row.textContent ?? ''))).toBe(true);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Month' }), 'all');

    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), 'type');
    expect(within(screen.getByRole('list', { name: 'Key events' })).getAllByRole('listitem')[0]).toHaveTextContent('Anniversary');

    await user.type(screen.getByRole('searchbox', { name: 'Search people or trees' }), 'nobody here');
    expect(await screen.findByText(/Nothing matches that search/)).toBeInTheDocument();
  }, 60_000);

  it('explains what is missing when there is nothing to show', async () => {
    eventsApi({ events: [], needDates: [{ treeId: TREE_ID, treeName: 'Sharma family', count: 12 }] });
    await renderApp('/events');
    expect(await screen.findByRole('heading', { name: 'No dates to remind you about yet' })).toBeInTheDocument();
    expect(screen.getByText(/Birthdays need a day and a month, not just a year/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '12 people in Sharma family need dates' })).toHaveAttribute('href', `/trees/${TREE_ID}/needs-detail`);
    await expectNoAxeViolations();
  }, 60_000);
});
