import { graphToOps } from '@kinfolk/shared/fixtures/fixtureBuilder';
import { buildSeedTree } from '@kinfolk/shared/fixtures/seedTree';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, latestMailTo, signUpUser, type TestClient, type TestContext } from './testApp';

let ctx: TestContext;
let namespace = 0x7000;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx.close();
});

async function seededTree(client: TestClient, name = 'Sharma family') {
  const tree = (await client.post('/api/trees', { name })).json().tree as { id: string; name: string };
  namespace += 1;
  const seed = buildSeedTree({ namespace });
  expect((await client.post(`/api/trees/${tree.id}/changes`, { ops: graphToOps(seed.graph) })).statusCode).toBe(200);
  return { tree, seed };
}

function reviewToken(text: string): string {
  const match = /\/review\/([A-Za-z0-9_.-]+)/.exec(text);
  if (!match?.[1]) throw new Error(`no review link in: ${text}`);
  return match[1];
}

describe('review workflow (SPEC §5.7)', () => {
  it('runs the whole cycle: submit, request changes, resolve, resubmit, approve', async () => {
    const owner = ctx.client();
    const { email: ownerEmail } = await signUpUser(owner, { firstName: 'Asha' });
    const { tree, seed } = await seededTree(owner);

    // Planning answers exist on the tree, so the reviewer's copy can be checked for them.
    expect(
      (await owner.post(`/api/trees/${tree.id}/changes`, { ops: [{ op: 'person.update', id: seed.people.ravi.id, patch: { planning: { overallObjective: 'Provide for the grandchildren', areasOfConcern: null, marketOutlook: null, familyRelationships: null, rateOfReturnView: null } } }] })).statusCode,
    ).toBe(200);

    const submitted = await owner.post(`/api/trees/${tree.id}/review`, { reviewerEmail: 'advisor@example.com', note: 'Please check the in-laws.' });
    expect(submitted.statusCode).toBe(201);
    expect(submitted.json().review).toMatchObject({ reviewerEmail: 'advisor@example.com', note: 'Please check the in-laws.', sentBy: 'Asha Rao', decision: null });
    expect((await owner.get(`/api/trees/${tree.id}`)).json().tree.status).toBe('in_review');
    // Editing is locked for everyone while it's with the reviewer (QUESTIONS Q21).
    const blocked = await owner.post(`/api/trees/${tree.id}/changes`, { ops: [{ op: 'person.update', id: seed.people.ravi.id, patch: { nickname: 'Rav' } }] });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.message).toMatch(/reviewer/i);
    const mail = await latestMailTo(ctx.mailer, 'advisor@example.com');
    expect(mail.text).toContain('Please check the in-laws.');
    const token = reviewToken(mail.text);

    const reviewer = ctx.client();
    await signUpUser(reviewer, { firstName: 'Nadia', lastName: 'Byrne', email: 'advisor@example.com' });
    const opened = await reviewer.get(`/api/review/${token}`);
    expect(opened.statusCode).toBe(200);
    expect(opened.json().tree).toMatchObject({ name: 'Sharma family', status: 'in_review' });
    // The reviewer sees planning answers (QUESTIONS Q9).
    const reviewedRavi = opened.json().graph.people.find((person: { id: string }) => person.id === seed.people.ravi.id);
    expect(reviewedRavi.planning).toMatchObject({ overallObjective: 'Provide for the grandchildren' });
    expect(opened.headers['cache-control']).toBe('no-store');

    const requested = await reviewer.post(`/api/review/${token}/changes`, { body: 'Ravi’s late father is missing a death date, and Priya’s parents need addresses.' });
    expect(requested.statusCode).toBe(201);
    expect(requested.json().changeRequest).toMatchObject({ status: 'open', author: 'Nadia Byrne' });
    expect((await owner.get(`/api/trees/${tree.id}`)).json().tree.status).toBe('changes_requested');
    expect((await latestMailTo(ctx.mailer, ownerEmail)).subject).toMatch(/asked for changes/);

    // The owner can edit again, sees the note, resolves it, and sends it back.
    expect((await owner.post(`/api/trees/${tree.id}/changes`, { ops: [{ op: 'person.update', id: seed.people.ravi.id, patch: { nickname: 'Rav' } }] })).statusCode).toBe(200);
    const state = (await owner.get(`/api/trees/${tree.id}/review`)).json();
    expect(state).toMatchObject({ status: 'changes_requested', assignment: { decision: 'changes_requested', reviewerName: 'Nadia Byrne' } });
    expect(state.changeRequests[0]).toMatchObject({ status: 'open', author: 'Nadia Byrne' });
    const inbox = (await owner.get('/api/me/inbox')).json();
    expect(inbox.changeRequests).toEqual([expect.objectContaining({ tree: { id: tree.id, name: 'Sharma family' }, author: 'Nadia Byrne' })]);
    expect((await owner.post(`/api/trees/${tree.id}/change-requests/${state.changeRequests[0].id}/resolve`, {})).statusCode).toBe(204);
    expect((await owner.get('/api/me/inbox')).json().changeRequests).toEqual([]);
    expect((await owner.post(`/api/trees/${tree.id}/review/resubmit`, {})).statusCode).toBe(200);
    expect((await owner.get(`/api/trees/${tree.id}`)).json().tree.status).toBe('in_review');

    const approved = await reviewer.post(`/api/review/${token}/approve`, {});
    expect(approved.statusCode).toBe(204);
    expect((await owner.get(`/api/trees/${tree.id}`)).json().tree.status).toBe('approved');
    expect((await latestMailTo(ctx.mailer, ownerEmail)).subject).toMatch(/approved/);

    // Editing an approved tree returns it to draft (QUESTIONS Q21).
    const afterApproval = await owner.post(`/api/trees/${tree.id}/changes`, { ops: [{ op: 'person.update', id: seed.people.ravi.id, patch: { nickname: 'Ravi' } }] });
    expect(afterApproval.json().treeStatus).toBe('draft');

    const actions = (await ctx.deps.prisma.auditEvent.findMany({ where: { treeId: tree.id, action: { startsWith: 'review.' } }, orderBy: { createdAt: 'asc' } })).map((event) => event.action);
    expect(actions).toEqual(['review.submit', 'review.open', 'review.request_changes', 'review.resolve', 'review.resubmit', 'review.approve']);
  });

  it('keeps a review link to the person who claimed it, and explains a withdrawn one', async () => {
    const owner = ctx.client();
    await signUpUser(owner);
    const { tree } = await seededTree(owner);
    await owner.post(`/api/trees/${tree.id}/review`, { reviewerEmail: 'first@example.com' });
    const token = reviewToken((await latestMailTo(ctx.mailer, 'first@example.com')).text);

    expect((await ctx.client().get(`/api/review/${token}`)).statusCode).toBe(401);
    const reviewer = ctx.client();
    await signUpUser(reviewer);
    expect((await reviewer.get(`/api/review/${token}`)).statusCode).toBe(200);
    const other = ctx.client();
    await signUpUser(other);
    const claimed = await other.get(`/api/review/${token}`);
    expect(claimed.statusCode).toBe(403);
    expect(claimed.json().error.message).toMatch(/already been claimed/);
    // Claiming grants a read-only role on the tree itself, never the ability to edit.
    expect((await reviewer.get(`/api/trees/${tree.id}/graph`)).json().tree.role).toBe('reviewer');
    // A reviewer is refused by role before the lock is even considered.
    expect((await reviewer.post(`/api/trees/${tree.id}/changes`, { ops: [] })).statusCode).toBe(403);

    expect((await owner.delete(`/api/trees/${tree.id}/review`)).statusCode).toBe(204);
    expect((await owner.get(`/api/trees/${tree.id}`)).json().tree.status).toBe('draft');
    const withdrawn = await reviewer.get(`/api/review/${token}`);
    expect(withdrawn.statusCode).toBe(410);
    expect(withdrawn.json().error.message).toMatch(/withdrawn/);
    expect((await ctx.client().get('/api/review/not.a.token')).statusCode).toBe(401);
  });

  it('refuses a second review, a short note, and anyone but the owner', async () => {
    const owner = ctx.client();
    await signUpUser(owner);
    const { tree } = await seededTree(owner);
    const editor = ctx.client();
    const { email } = await signUpUser(editor);
    const accessId = (await owner.post(`/api/trees/${tree.id}/access`, { email, role: 'editor' })).json().access.id;
    await editor.post(`/api/me/access-invites/${accessId}/accept`, {});
    expect((await editor.post(`/api/trees/${tree.id}/review`, { reviewerEmail: 'advisor@example.com' })).statusCode).toBe(403);

    expect((await owner.post(`/api/trees/${tree.id}/review`, { reviewerEmail: 'advisor@example.com' })).statusCode).toBe(201);
    const again = await owner.post(`/api/trees/${tree.id}/review`, { reviewerEmail: 'other@example.com' });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.message).toMatch(/already with a reviewer/);

    const token = reviewToken((await latestMailTo(ctx.mailer, 'advisor@example.com')).text);
    const reviewer = ctx.client();
    await signUpUser(reviewer);
    await reviewer.get(`/api/review/${token}`);
    const short = await reviewer.post(`/api/review/${token}/changes`, { body: 'no' });
    expect(short.statusCode).toBe(400);
    expect(short.json().error.fields.body).toMatch(/at least 15 characters/);
    expect((await editor.post(`/api/trees/${tree.id}/review/resubmit`, {})).statusCode).toBe(403);
  });
});
