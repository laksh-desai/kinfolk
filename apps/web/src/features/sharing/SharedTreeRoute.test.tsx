import { buildSeedTree } from '@kinfolk/shared/fixtures/seedTree';
import type { SharedTreeDto } from '@kinfolk/shared/schemas/collaboration';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../../test/axe';
import { mockApi, signedOut } from '../../test/mockApi';
import { renderApp } from '../../test/renderApp';

const seed = buildSeedTree();

const sharedBody: SharedTreeDto = {
  tree: { name: 'Sharma family', status: 'draft' },
  graph: {
    focusPersonId: seed.graph.focusPersonId,
    parentChildren: seed.graph.parentChildren,
    unions: seed.graph.unions.map((union) => ({ ...union, startDate: null, endDate: null })),
    people: seed.graph.people.map((person) => ({
      id: person.id,
      createdAt: person.createdAt,
      firstName: person.firstName,
      lastName: person.lastName,
      maidenName: person.maidenName,
      nickname: person.nickname,
      suffix: person.suffix,
      gender: person.gender,
      lifeStatus: person.lifeStatus,
      birthYear: person.birthDate?.year ?? null,
      isPlaceholder: person.isPlaceholder,
    })),
  },
};

describe('a tree opened from a share link (SPEC §5.6, §2)', () => {
  it('shows the family read-only, with no sign-in and nothing to edit', async () => {
    const user = userEvent.setup();
    mockApi({ 'GET /api/auth/me': signedOut, 'GET /api/shared/tok': () => ({ body: sharedBody }) });
    const { router } = await renderApp('/s/tok');
    expect(await screen.findByRole('heading', { level: 1, name: 'Sharma family' })).toBeInTheDocument();
    expect(screen.getByText('Shared view · read-only')).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Sharma family · shared · Kinfolk'));
    const canvas = await screen.findByRole('region', { name: 'Family tree canvas' });
    expect(within(canvas).getByRole('button', { name: 'Ravi Sharma, Self, focus person' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Add person' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Undo/ })).not.toBeInTheDocument();

    await user.click(within(canvas).getByRole('button', { name: /^Sita Sharma/ }));
    await waitFor(() => expect(router.state.location.search).toBe(`?person=${seed.people.sita.id}`));
    const panel = await screen.findByRole('complementary', { name: 'Sita Sharma' });
    expect(panel).toHaveTextContent('b. 1940 · Paternal grandmother');
    expect(panel).toHaveTextContent('Contact details, addresses, full dates, notes, and planning answers aren’t included');
    expect(within(panel).getByRole('link', { name: 'Mohan Sharma' })).toBeInTheDocument();
    expect(within(panel).queryByRole('link', { name: /^Edit/ })).not.toBeInTheDocument();
    await expectNoAxeViolations();
  }, 60_000);

  it('offers the same list view, restorable from the URL', async () => {
    mockApi({ 'GET /api/auth/me': signedOut, 'GET /api/shared/tok': () => ({ body: sharedBody }) });
    await renderApp('/s/tok?view=list');
    const list = await screen.findByRole('region', { name: 'Family tree list' });
    expect(within(list).getByRole('heading', { level: 2, name: 'Generation 1 — oldest' })).toBeInTheDocument();
    expect(within(list).getAllByRole('link', { name: 'Ravi Sharma' })[0]).toHaveAttribute('href', `/s/tok?person=${seed.people.ravi.id}&view=list`);
    expect(within(list).queryByRole('button', { name: /^Delete/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'List' })).toHaveAttribute('aria-current', 'page');
  }, 60_000);

  it('explains a link that was turned off or never worked', async () => {
    mockApi({
      'GET /api/auth/me': signedOut,
      'GET /api/shared/gone': () => ({ status: 410, body: { error: { code: 'share_link_revoked', message: 'The owner has turned off this share link. Ask them for a new one if you still need to see the tree.' } } }),
      'GET /api/shared/bad': () => ({ status: 404, body: { error: { code: 'share_link_invalid', message: 'This share link isn’t valid. Check that you copied the whole link.' } } }),
    });
    await renderApp('/s/gone');
    expect(await screen.findByRole('heading', { name: 'This share link no longer works' })).toBeInTheDocument();
    expect(screen.getByText(/turned off this share link/)).toBeInTheDocument();

    await renderApp('/s/bad');
    expect(await screen.findByRole('heading', { name: 'This share link can’t be opened' })).toBeInTheDocument();
  }, 60_000);
});
