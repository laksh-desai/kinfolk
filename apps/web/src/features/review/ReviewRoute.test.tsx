import { buildSeedTree } from '@kinfolk/shared/fixtures/seedTree';
import type { ReviewTreeDto } from '@kinfolk/shared/schemas/review';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../../test/axe';
import { mockApi, signedOut, testUser } from '../../test/mockApi';
import { renderApp } from '../../test/renderApp';

const seed = buildSeedTree();
const ravi = seed.people.ravi.id;

function reviewBody(overrides: Partial<ReviewTreeDto> = {}): ReviewTreeDto {
  return {
    tree: { id: '11111111-1111-4111-8111-111111111111', name: 'Sharma family', status: 'in_review' },
    graph: seed.graph,
    assignment: {
      id: 'r1',
      reviewerEmail: testUser.email,
      reviewerName: 'Asha Rao',
      note: 'Please check the in-laws.',
      sentBy: 'Ravi Sharma',
      sentAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
      decision: null,
      decidedAt: null,
    },
    changeRequests: [],
    ...overrides,
  };
}

describe('the reviewer’s screen (SPEC §5.7)', () => {
  it('asks a signed-out reviewer to sign in, keeping the link to come back to', async () => {
    mockApi({ 'GET /api/auth/me': signedOut });
    await renderApp('/review/tok123');
    expect(await screen.findByRole('heading', { name: 'Sign in to review this family tree' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login?returnTo=%2Freview%2Ftok123');
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/signup?returnTo=%2Freview%2Ftok123');
    await expectNoAxeViolations();
  }, 60_000);

  it('shows the whole tree read-only, with each person’s detail, and approves it', async () => {
    const user = userEvent.setup();
    let approved = false;
    mockApi({
      'GET /api/auth/me': () => ({ body: { user: testUser } }),
      'GET /api/review/tok123': () => ({ body: approved ? reviewBody({ tree: { id: '11111111-1111-4111-8111-111111111111', name: 'Sharma family', status: 'approved' } }) : reviewBody() }),
      'POST /api/review/tok123/approve': () => {
        approved = true;
        return { status: 204 };
      },
    });
    const { router } = await renderApp('/review/tok123');
    expect(await screen.findByRole('heading', { level: 1, name: 'Sharma family' })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Review Sharma family · Kinfolk'));
    const review = screen.getByRole('complementary', { name: 'Review' });
    expect(review).toHaveTextContent('Ravi Sharma sent this to you 3 hours ago.');
    expect(review).toHaveTextContent('Please check the in-laws.');
    expect(review).toHaveTextContent('2 still unnamed, which is allowed');
    expect(screen.queryByRole('link', { name: 'Add person' })).not.toBeInTheDocument();

    await user.click(within(screen.getByRole('region', { name: 'Family tree canvas' })).getByRole('button', { name: /^Ravi Sharma/ }));
    await waitFor(() => expect(router.state.location.search).toBe(`?person=${ravi}`));
    expect(await within(review).findByRole('heading', { level: 2, name: 'Ravi Sharma' })).toBeInTheDocument();
    expect(review).toHaveTextContent('ravi.sharma@example.com');
    await expectNoAxeViolations();

    await user.click(within(review).getByRole('button', { name: 'Approve “Sharma family”' }));
    await waitFor(() => expect(approved).toBe(true));
    await waitFor(() => expect(screen.getByTestId('live-polite')).toHaveTextContent('You approved “Sharma family”. The owner has been told.'));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Approve “Sharma family”' })).not.toBeInTheDocument());
    expect(screen.getByText('Approved')).toBeInTheDocument();
  }, 60_000);

  it('requires real words before sending a change request', async () => {
    const user = userEvent.setup();
    let sent: unknown = null;
    mockApi({
      'GET /api/auth/me': () => ({ body: { user: testUser } }),
      'GET /api/review/tok123': () => ({ body: reviewBody() }),
      'POST /api/review/tok123/changes': (request) => {
        sent = request.body;
        return { status: 201, body: { changeRequest: { id: 'c1' } } };
      },
    });
    await renderApp('/review/tok123');
    const review = await screen.findByRole('complementary', { name: 'Review' });
    await user.click(within(review).getByRole('button', { name: 'Request changes' }));
    const note = within(review).getByRole('textbox', { name: 'What needs changing' });
    await waitFor(() => expect(note).toHaveFocus());
    expect(note).toHaveAccessibleDescription(/at least 15 characters/);
    expect(sent).toBeNull();
    await user.type(note, 'The death date for Mohan is missing.');
    await user.click(within(review).getByRole('button', { name: 'Request changes' }));
    await waitFor(() => expect(sent).toEqual({ body: 'The death date for Mohan is missing.' }));
    await waitFor(() => expect(screen.getByTestId('live-polite')).toHaveTextContent('Your notes were sent to the owner.'));
  }, 60_000);

  it('explains a withdrawn review and one claimed by someone else', async () => {
    mockApi({
      'GET /api/auth/me': () => ({ body: { user: testUser } }),
      'GET /api/review/gone': () => ({ status: 410, body: { error: { code: 'review_withdrawn', message: 'This review was withdrawn by the tree’s owner.' } } }),
      'GET /api/review/taken': () => ({ status: 403, body: { error: { code: 'review_claimed', message: 'This review link has already been claimed by someone else. Ask the owner to send you your own link.' } } }),
    });
    await renderApp('/review/gone');
    expect(await screen.findByRole('heading', { name: 'This review was withdrawn' })).toBeInTheDocument();
    await renderApp('/review/taken');
    expect(await screen.findByRole('heading', { name: 'This review belongs to someone else' })).toBeInTheDocument();
    expect(screen.getByText(/Ask the owner to send you your own link/)).toBeInTheDocument();
  }, 60_000);
});
