import type { ReviewStateDto } from '@kinfolk/shared/schemas/review';
import type { TreeStatus } from '@kinfolk/shared/schemas/tree';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../../test/axe';
import { renderApp } from '../../test/renderApp';
import { TREE_ID } from '../../test/treeFixtures';
import { mockTreeServer } from '../../test/treeServer';

const assignment = {
  id: 'r1',
  reviewerEmail: 'advisor@example.com',
  reviewerName: 'Nadia Byrne',
  note: 'Please check the in-laws.',
  sentBy: 'Asha Rao',
  sentAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
  decision: null as 'approved' | 'changes_requested' | null,
  decidedAt: null as string | null,
};

function reviewServer(status: TreeStatus, state: Partial<ReviewStateDto> = {}) {
  const server = mockTreeServer({ tree: { status } });
  server.api.set(`GET /api/trees/${TREE_ID}/review`, () => ({ body: { status, assignment, changeRequests: [], ...state } }));
  return server;
}

describe('sending a tree for review (SPEC §5.7)', () => {
  it('explains what submitting does, requires a reviewer email, and sends it', async () => {
    const user = userEvent.setup();
    const server = reviewServer('draft', { assignment: null });
    let submitted: unknown = null;
    server.api.set(`POST /api/trees/${TREE_ID}/review`, (request) => {
      submitted = request.body;
      return { status: 201, body: { review: assignment } };
    });
    const { router } = await renderApp(`/trees/${TREE_ID}`);
    await user.click(await screen.findByRole('link', { name: 'Send for review' }));
    const dialog = await screen.findByRole('dialog', { name: 'Send “Sharma family” for review' });
    expect(dialog).toHaveTextContent('editing is paused for everyone, so they see a stable record');
    await user.click(within(dialog).getByRole('button', { name: 'Send for review' }));
    const email = within(dialog).getByRole('textbox', { name: 'Reviewer’s email' });
    await waitFor(() => expect(email).toHaveFocus());
    expect(email).toHaveAccessibleDescription(/Enter your reviewer’s email address\./);
    await user.type(email, 'advisor@example.com');
    await user.type(within(dialog).getByRole('textbox', { name: /Note for your reviewer/ }), 'Please check the in-laws.');
    await expectNoAxeViolations();
    await user.click(within(dialog).getByRole('button', { name: 'Send for review' }));
    await waitFor(() => expect(submitted).toEqual({ reviewerEmail: 'advisor@example.com', note: 'Please check the in-laws.' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/trees/${TREE_ID}`));
  }, 60_000);

  it('shows who has it while in review, with a way to withdraw, and no editing', async () => {
    const user = userEvent.setup();
    const server = reviewServer('in_review');
    let withdrawn = false;
    server.api.set(`DELETE /api/trees/${TREE_ID}/review`, () => {
      withdrawn = true;
      return { status: 204 };
    });
    await renderApp(`/trees/${TREE_ID}`);
    const banner = await screen.findByRole('region', { name: 'Review status' });
    expect(banner).toHaveTextContent('With Nadia Byrne since 2 hours ago. Editing is paused so they see a stable record.');
    expect(screen.getByText('In review')).toBeInTheDocument();
    // Editing affordances are gone while it's locked.
    expect(screen.queryByRole('link', { name: 'Add person' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Undo/ })).not.toBeInTheDocument();
    await expectNoAxeViolations();
    await user.click(within(banner).getByRole('button', { name: 'Withdraw from review' }));
    await waitFor(() => expect(withdrawn).toBe(true));
    await waitFor(() => expect(screen.getByTestId('live-polite')).toHaveTextContent('Withdrawn from review. You can edit again.'));
  }, 60_000);

  it('shows the reviewer’s notes, marks one resolved, and resubmits', async () => {
    const user = userEvent.setup();
    const changeRequest = { id: 'c1', body: 'Ravi’s late father needs a death date.', status: 'open' as const, author: 'Nadia Byrne', createdAt: new Date(Date.now() - 86_400_000).toISOString(), resolvedAt: null };
    const server = reviewServer('changes_requested', { assignment: { ...assignment, decision: 'changes_requested', decidedAt: new Date().toISOString() }, changeRequests: [changeRequest] });
    let resolved = false;
    let resubmitted = false;
    server.api.set(`GET /api/trees/${TREE_ID}/review`, () => ({
      body: {
        status: resubmitted ? 'in_review' : 'changes_requested',
        assignment: { ...assignment, decision: resubmitted ? null : 'changes_requested' },
        changeRequests: [{ ...changeRequest, status: resolved ? 'resolved' : 'open' }],
      },
    }));
    server.api.set(`POST /api/trees/${TREE_ID}/change-requests/c1/resolve`, () => {
      resolved = true;
      return { status: 204 };
    });
    server.api.set(`POST /api/trees/${TREE_ID}/review/resubmit`, () => {
      resubmitted = true;
      return { body: { review: assignment } };
    });
    await renderApp(`/trees/${TREE_ID}`);
    const banner = await screen.findByRole('region', { name: 'Review status' });
    expect(banner).toHaveTextContent('Nadia Byrne asked for changes. You can edit the tree again.');
    expect(banner).toHaveTextContent('Ravi’s late father needs a death date.');
    expect(banner).toHaveTextContent('Nadia Byrne · yesterday');
    // Editing is allowed again.
    expect(screen.getByRole('link', { name: 'Add person' })).toBeInTheDocument();
    await user.click(within(banner).getByRole('button', { name: 'Mark the note from Nadia Byrne resolved' }));
    await waitFor(() => expect(resolved).toBe(true));
    await user.click(within(banner).getByRole('button', { name: 'Resubmit for review' }));
    await waitFor(() => expect(resubmitted).toBe(true));
  }, 60_000);

  it('says an approved tree goes back to draft if it is edited', async () => {
    reviewServer('approved', { assignment: { ...assignment, decision: 'approved', decidedAt: new Date(Date.now() - 3 * 86_400_000).toISOString() } });
    await renderApp(`/trees/${TREE_ID}`);
    const banner = await screen.findByRole('region', { name: 'Review status' });
    expect(banner).toHaveTextContent('Approved by Nadia Byrne 3 days ago. Editing it again returns it to draft');
    expect(screen.getByText('Approved')).toBeInTheDocument();
  }, 60_000);
});
