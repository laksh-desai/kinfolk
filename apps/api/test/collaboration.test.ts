import { graphToOps } from '@kinfolk/shared/fixtures/fixtureBuilder';
import { buildSeedTree } from '@kinfolk/shared/fixtures/seedTree';
import { REDACTED_PERSON_KEYS } from '@kinfolk/shared/schemas/person';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, latestMailTo, signUpUser, type TestClient, type TestContext } from './testApp';

let ctx: TestContext;
let namespace = 0x6000;

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
  const response = await client.post(`/api/trees/${tree.id}/changes`, { ops: graphToOps(seed.graph) });
  expect(response.statusCode).toBe(200);
  return { tree, seed };
}

function tokenFrom(text: string, route: 's' | 'invite'): string {
  const match = new RegExp(`/${route}/([A-Za-z0-9_.-]+)`).exec(text);
  if (!match?.[1]) throw new Error(`no /${route}/ link in: ${text}`);
  return match[1];
}

describe('access control (SPEC §5.6)', () => {
  it('lets the owner invite, change roles, and revoke; the invitee accepts; roles are enforced per request', async () => {
    const owner = ctx.client();
    await signUpUser(owner);
    const { tree } = await seededTree(owner);
    const member = ctx.client();
    const { email, user } = await signUpUser(member, { firstName: 'Kiran' });

    const invited = await owner.post(`/api/trees/${tree.id}/access`, { name: 'Kiran Rao', email: email.toUpperCase(), role: 'viewer' });
    expect(invited.statusCode).toBe(201);
    const accessId = invited.json().access.id as string;
    expect(invited.json().access).toMatchObject({ email, status: 'invited', role: 'viewer' });
    expect((await latestMailTo(ctx.mailer, email)).subject).toMatch(/shared “Sharma family” with you/);
    // Not a member until accepted.
    expect((await member.get(`/api/trees/${tree.id}/graph`)).statusCode).toBe(404);

    const inbox = (await member.get('/api/me/inbox')).json();
    expect(inbox.accessInvites).toEqual([expect.objectContaining({ id: accessId, tree: { id: tree.id, name: 'Sharma family' }, role: 'viewer' })]);
    expect((await member.post(`/api/me/access-invites/${accessId}/accept`, {})).statusCode).toBe(204);
    expect((await member.get(`/api/trees/${tree.id}/graph`)).json().tree.role).toBe('viewer');
    expect((await member.post(`/api/trees/${tree.id}/changes`, { ops: [] })).statusCode).toBe(403);

    // Members see the list but can't manage it; a duplicate invite is refused with a field message.
    const list = (await member.get(`/api/trees/${tree.id}/access`)).json();
    expect(list).toMatchObject({ canManage: false, members: [expect.objectContaining({ email, status: 'active' })] });
    expect((await member.patch(`/api/trees/${tree.id}/access/${accessId}`, { role: 'editor' })).statusCode).toBe(403);
    const duplicate = await owner.post(`/api/trees/${tree.id}/access`, { email, role: 'editor' });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error.fields.email).toMatch(/already has access/);

    expect((await owner.patch(`/api/trees/${tree.id}/access/${accessId}`, { role: 'editor' })).statusCode).toBe(200);
    expect((await member.get(`/api/trees/${tree.id}/graph`)).json().tree.role).toBe('editor');
    expect((await owner.delete(`/api/trees/${tree.id}/access/${accessId}`)).statusCode).toBe(204);
    expect((await member.get(`/api/trees/${tree.id}/graph`)).statusCode).toBe(404);
    expect(user.id).toBeTruthy();

    const events = await ctx.deps.prisma.auditEvent.findMany({ where: { treeId: tree.id, action: { startsWith: 'access.' } }, orderBy: { createdAt: 'asc' } });
    expect(events.map((event) => event.action)).toEqual(['access.invite', 'access.accept', 'access.role', 'access.revoke']);
  });

  it('refuses inviting the owner, and lets no one but the invitee accept', async () => {
    const owner = ctx.client();
    const { email: ownerEmail } = await signUpUser(owner);
    const { tree } = await seededTree(owner);
    const self = await owner.post(`/api/trees/${tree.id}/access`, { email: ownerEmail, role: 'editor' });
    expect(self.statusCode).toBe(400);
    const accessId = (await owner.post(`/api/trees/${tree.id}/access`, { email: 'someone@example.com', role: 'viewer' })).json().access.id;
    const intruder = ctx.client();
    await signUpUser(intruder);
    expect((await intruder.post(`/api/me/access-invites/${accessId}/accept`, {})).statusCode).toBe(404);
  });

  it('rate-limits sending invitations', async () => {
    const limited = await createTestContext({ inviteRateLimit: { max: 2, timeWindow: '1 minute' } });
    try {
      const owner = limited.client();
      await signUpUser(owner);
      const tree = (await owner.post('/api/trees', { name: 'Limits' })).json().tree;
      const codes = [];
      for (const n of [1, 2, 3]) codes.push((await owner.post(`/api/trees/${tree.id}/access`, { email: `p${n}@example.com`, role: 'viewer' })).statusCode);
      expect(codes).toEqual([201, 201, 429]);
    } finally {
      await limited.close();
    }
  });
});

describe('share links (SPEC §5.6, §2)', () => {
  it('returns only names, relationships, and birth years to a link visitor', async () => {
    const owner = ctx.client();
    await signUpUser(owner);
    const { tree, seed } = await seededTree(owner);
    const created = await owner.post(`/api/trees/${tree.id}/share-links`, { expiresInDays: 7 });
    expect(created.statusCode).toBe(201);
    const { url, link } = created.json();
    expect(link).toMatchObject({ status: 'active' });
    const token = tokenFrom(url, 's');

    const visitor = ctx.client();
    const shared = await visitor.get(`/api/shared/${token}`);
    expect(shared.statusCode).toBe(200);
    expect(shared.headers['cache-control']).toBe('no-store');
    const body = shared.json();
    expect(body.tree).toEqual({ name: 'Sharma family', status: 'draft' });
    for (const person of body.graph.people) expect(Object.keys(person).sort()).toEqual([...REDACTED_PERSON_KEYS].sort());
    const ravi = body.graph.people.find((person: { id: string }) => person.id === seed.people.ravi.id);
    expect(ravi).toMatchObject({ firstName: 'Ravi', birthYear: 1988 });
    const text = JSON.stringify(body);
    for (const secret of ['ravi.sharma@example.com', '+1 415 555 0142', 'Alder Street', 'Architect', 'executor', 'planning', 'photoUrl', 'address', 'phone', 'email', 'notes', 'linkedTreeId']) {
      expect(text).not.toContain(secret);
    }
    expect(body.graph.unions.every((union: { startDate: unknown; endDate: unknown }) => union.startDate === null && union.endDate === null)).toBe(true);
  });

  it('explains invalid, revoked, and expired links, and lists links only to the owner', async () => {
    const owner = ctx.client();
    await signUpUser(owner);
    const { tree } = await seededTree(owner);
    const visitor = ctx.client();
    const forged = await visitor.get('/api/shared/eyJyaWQiOiJ4In0.notasignature');
    expect(forged.statusCode).toBe(404);
    expect(forged.json().error.message).toMatch(/isn’t valid/);

    const first = (await owner.post(`/api/trees/${tree.id}/share-links`, { expiresInDays: 7 })).json();
    expect((await owner.delete(`/api/trees/${tree.id}/share-links/${first.link.id}`)).statusCode).toBe(204);
    const revoked = await visitor.get(`/api/shared/${tokenFrom(first.url, 's')}`);
    expect(revoked.statusCode).toBe(410);
    expect(revoked.json().error.message).toMatch(/turned off/);

    const second = (await owner.post(`/api/trees/${tree.id}/share-links`, { expiresInDays: 7 })).json();
    // Age the link rather than the clock, which would also end the test sessions.
    await ctx.deps.prisma.shareLink.update({ where: { id: second.link.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await visitor.get(`/api/shared/${tokenFrom(second.url, 's')}`);
    expect(expired.statusCode).toBe(410);
    expect(expired.json().error.message).toMatch(/expired/);
    const links = (await owner.get(`/api/trees/${tree.id}/share-links`)).json().links.map((entry: { status: string }) => entry.status);
    expect(links.sort()).toEqual(['expired', 'revoked']);
    const never = (await owner.post(`/api/trees/${tree.id}/share-links`, { expiresInDays: null })).json();
    expect(never.link.expiresAt).toBeNull();
    expect((await visitor.get(`/api/shared/${tokenFrom(never.url, 's')}`)).statusCode).toBe(200);

    const editor = ctx.client();
    const { email } = await signUpUser(editor);
    const accessId = (await owner.post(`/api/trees/${tree.id}/access`, { email, role: 'editor' })).json().access.id;
    await editor.post(`/api/me/access-invites/${accessId}/accept`, {});
    expect((await editor.get(`/api/trees/${tree.id}/share-links`)).statusCode).toBe(403);
    expect((await editor.post(`/api/trees/${tree.id}/share-links`, {})).statusCode).toBe(403);
  });
});

describe('invitations and linked trees (SPEC §5.5)', () => {
  it('advances through all four stages from real events, and links the trees on approval', async () => {
    const owner = ctx.client();
    const { email: ownerEmail } = await signUpUser(owner, { firstName: 'Asha' });
    const { tree, seed } = await seededTree(owner);
    const kiranId = seed.people.kiran.id;

    const sent = await owner.post(`/api/trees/${tree.id}/invitations`, { personId: kiranId, email: 'kiran@example.com' });
    expect(sent.statusCode).toBe(201);
    const invitationId = sent.json().invitation.id as string;
    expect(sent.json().invitation).toMatchObject({ stage: 'sent', joinedAt: null });
    const firstToken = tokenFrom((await latestMailTo(ctx.mailer, 'kiran@example.com')).text, 'invite');

    // Resending replaces the token; the old link stops working.
    expect((await owner.post(`/api/trees/${tree.id}/invitations/${invitationId}/resend`, {})).statusCode).toBe(200);
    const token = tokenFrom((await latestMailTo(ctx.mailer, 'kiran@example.com')).text, 'invite');
    expect(token).not.toBe(firstToken);
    const visitor = ctx.client();
    expect((await visitor.get(`/api/invitations/${firstToken}`)).statusCode).toBe(404);
    expect((await visitor.get(`/api/invitations/${token}`)).json()).toEqual({ invitedBy: 'Asha Rao', treeName: 'Sharma family', personName: 'Kiran Rao', status: 'open' });
    expect((await visitor.post(`/api/invitations/${token}/accept`, {})).statusCode).toBe(401);

    const invitee = ctx.client();
    await signUpUser(invitee, { firstName: 'Kiran', email: 'kiran@example.com' });
    const joined = await invitee.post(`/api/invitations/${token}/accept`, {});
    expect(joined.json().invitation).toMatchObject({ stage: 'joined' });
    expect(joined.json().invitation.joinedAt).not.toBeNull();
    expect((await invitee.get(`/api/trees/${tree.id}/graph`)).statusCode).toBe(404);

    const ownTree = (await invitee.post('/api/trees', { name: 'Rao family' })).json().tree;
    const stages = (await owner.get(`/api/trees/${tree.id}/invitations`)).json().invitations;
    expect(stages[0]).toMatchObject({ stage: 'tree_created' });
    expect(stages[0].treeCreatedAt).not.toBeNull();

    expect((await invitee.get('/api/me/inbox')).json().invitations).toEqual([
      expect.objectContaining({ id: invitationId, tree: { id: tree.id, name: 'Sharma family' }, personName: 'Kiran Rao', stage: 'tree_created', pendingLinkRequest: false }),
    ]);
    const requested = await invitee.post(`/api/me/invitations/${invitationId}/link-request`, { fromTreeId: ownTree.id });
    expect(requested.statusCode).toBe(201);
    expect((await invitee.post(`/api/me/invitations/${invitationId}/link-request`, { fromTreeId: ownTree.id })).statusCode).toBe(409);

    const ownerInbox = (await owner.get('/api/me/inbox')).json();
    expect(ownerInbox.linkRequests).toEqual([expect.objectContaining({ person: { id: kiranId, name: 'Kiran Rao' }, fromTree: { id: ownTree.id, name: 'Rao family' }, requestedBy: 'Kiran Rao' })]);
    expect((await invitee.post(`/api/trees/${tree.id}/link-requests/${requested.json().id}/approve`, {})).statusCode).toBe(404);
    expect((await owner.post(`/api/trees/${tree.id}/link-requests/${requested.json().id}/approve`, {})).statusCode).toBe(204);

    const graph = (await owner.get(`/api/trees/${tree.id}/graph`)).json().graph;
    expect(graph.people.find((person: { id: string }) => person.id === kiranId).linkedTreeId).toBe(ownTree.id);
    const linked = (await owner.get(`/api/trees/${tree.id}/invitations`)).json().invitations[0];
    expect(linked).toMatchObject({ stage: 'linked' });
    expect(linked.linkedAt).not.toBeNull();
    // The approving owner can now open the linked tree, read-only.
    expect((await owner.get(`/api/trees/${ownTree.id}/graph`)).json().tree.role).toBe('viewer');
    expect(ownerEmail).toBeTruthy();
    expect((await owner.get(`/api/trees/${tree.id}/link-requests`)).json().requests[0]).toMatchObject({ status: 'approved' });
  });

  it('refuses a link to someone else’s tree, withdrawn and expired invitations, and editors of other trees', async () => {
    const owner = ctx.client();
    await signUpUser(owner);
    const { tree, seed } = await seededTree(owner);
    const invitationId = (await owner.post(`/api/trees/${tree.id}/invitations`, { personId: seed.people.sam.id, email: 'sam@example.com' })).json().invitation.id;
    const token = tokenFrom((await latestMailTo(ctx.mailer, 'sam@example.com')).text, 'invite');
    const again = await owner.post(`/api/trees/${tree.id}/invitations`, { personId: seed.people.sam.id, email: 'sam@example.com' });
    expect(again.statusCode).toBe(409);

    const invitee = ctx.client();
    await signUpUser(invitee);
    await invitee.post(`/api/invitations/${token}/accept`, {});
    const stranger = ctx.client();
    await signUpUser(stranger);
    const strangerTree = (await stranger.post('/api/trees', { name: 'Not yours' })).json().tree;
    const bad = await invitee.post(`/api/me/invitations/${invitationId}/link-request`, { fromTreeId: strangerTree.id });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.fields.fromTreeId).toBe('Choose one of your own family trees.');

    const second = (await owner.post(`/api/trees/${tree.id}/invitations`, { personId: seed.people.ada.id, email: 'ada@example.com' })).json().invitation.id;
    const adaToken = tokenFrom((await latestMailTo(ctx.mailer, 'ada@example.com')).text, 'invite');
    expect((await owner.delete(`/api/trees/${tree.id}/invitations/${second}`)).statusCode).toBe(204);
    expect((await ctx.client().get(`/api/invitations/${adaToken}`)).json().status).toBe('revoked');
    const late = ctx.client();
    await signUpUser(late);
    expect((await late.post(`/api/invitations/${adaToken}/accept`, {})).statusCode).toBe(410);

    const third = (await owner.post(`/api/trees/${tree.id}/invitations`, { personId: seed.people.kofi.id, email: 'kofi@example.com' })).json().invitation.id;
    const kofiToken = tokenFrom((await latestMailTo(ctx.mailer, 'kofi@example.com')).text, 'invite');
    await ctx.deps.prisma.invitation.update({ where: { id: third }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await ctx.client().get(`/api/invitations/${kofiToken}`)).json().status).toBe('expired');
    expect((await late.post(`/api/invitations/${kofiToken}/accept`, {})).statusCode).toBe(410);
    expect(third).toBeTruthy();

    const viewer = ctx.client();
    const { email } = await signUpUser(viewer);
    const accessId = (await owner.post(`/api/trees/${tree.id}/access`, { email, role: 'viewer' })).json().access.id;
    await viewer.post(`/api/me/access-invites/${accessId}/accept`, {});
    expect((await viewer.post(`/api/trees/${tree.id}/invitations`, { personId: seed.people.luca.id, email: 'luca@example.com' })).statusCode).toBe(403);
  });
});
