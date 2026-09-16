import { graphToOps } from '@kinfolk/shared/fixtures/fixtureBuilder';
import { buildSeedTree } from '@kinfolk/shared/fixtures/seedTree';
import type { ChangeOp } from '@kinfolk/shared/schemas/changeSet';
import type { TreeGraph } from '@kinfolk/shared/schemas/graph';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, signUpUser, type TestClient, type TestContext } from './testApp';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx.close();
});

let seedCounter = 0;

async function ownerWithSeedTree() {
  const owner = ctx.client();
  await signUpUser(owner);
  const tree = (await owner.post('/api/trees', { name: 'Sharma family' })).json().tree as { id: string };
  seedCounter += 1;
  const seed = buildSeedTree({ namespace: 0x5e000 + seedCounter });
  const response = await owner.post(`/api/trees/${tree.id}/changes`, { ops: graphToOps(seed.graph), description: 'Seed' });
  expect(response.statusCode, response.body).toBe(200);
  return { owner, treeId: tree.id, seed };
}

async function member(treeId: string, role: 'editor' | 'viewer') {
  const client = ctx.client();
  const { user, email } = await signUpUser(client);
  await ctx.deps.prisma.access.create({ data: { treeId, userId: user.id, email, role, status: 'active' } });
  return client;
}

const sorted = (graph: TreeGraph) => ({
  people: [...graph.people].sort((a, b) => a.id.localeCompare(b.id)),
  unions: [...graph.unions].sort((a, b) => a.id.localeCompare(b.id)),
  parentChildren: [...graph.parentChildren].sort((a, b) => a.id.localeCompare(b.id)),
  focusPersonId: graph.focusPersonId,
});

async function graphOf(client: TestClient, treeId: string) {
  const response = await client.get(`/api/trees/${treeId}/graph`);
  expect(response.statusCode).toBe(200);
  return response.json() as { tree: { version: number; status: string; role: string }; graph: TreeGraph };
}

describe('graph persistence', () => {
  it('stores the whole seed fixture and returns it field-for-field (partial dates, JSON, placeholders)', async () => {
    const { owner, treeId, seed } = await ownerWithSeedTree();
    const { graph, tree } = await graphOf(owner, treeId);
    expect(sorted(graph)).toEqual(sorted(seed.graph));
    expect(tree.version).toBe(1);
    const listed = (await owner.get('/api/trees')).json().trees[0];
    expect(listed.peopleCount).toBe(seed.graph.people.length);
  });

  it('writes one audit event per operation, with before and after', async () => {
    const { owner, treeId, seed } = await ownerWithSeedTree();
    const baseline = await ctx.deps.prisma.auditEvent.count({ where: { treeId } });
    const ravi = seed.people.ravi;
    await owner.post(`/api/trees/${treeId}/changes`, {
      ops: [
        { op: 'person.update', id: ravi.id, patch: { nickname: 'Rav' } },
        { op: 'person.update', id: seed.people.asha.id, patch: { profession: 'Teacher' } },
      ],
    });
    const events = await ctx.deps.prisma.auditEvent.findMany({ where: { treeId }, orderBy: { createdAt: 'desc' }, take: 2 });
    expect(await ctx.deps.prisma.auditEvent.count({ where: { treeId } })).toBe(baseline + 2);
    const raviEvent = events.find((event) => event.targetId === ravi.id);
    expect(raviEvent).toMatchObject({ action: 'person.update', targetType: 'person' });
    expect((raviEvent?.before as { nickname: string | null }).nickname).toBeNull();
    expect((raviEvent?.after as { nickname: string }).nickname).toBe('Rav');
  });

  it('rejects a cycle with a human message and persists nothing from that change set', async () => {
    const { owner, treeId, seed } = await ownerWithSeedTree();
    const before = await graphOf(owner, treeId);
    const response = await owner.post(`/api/trees/${treeId}/changes`, {
      ops: [
        { op: 'person.update', id: seed.people.ravi.id, patch: { nickname: 'should not persist' } },
        { op: 'parentChild.create', edge: { id: '99999999-0000-4000-8000-000000000001', unionId: seed.unions.raviPriya.id, childId: seed.people.hari.id, kind: 'adopted' } },
      ],
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toBe(
      'That would make Hari Sharma their own ancestor, because Ravi Sharma already descends from Hari Sharma.',
    );
    const after = await graphOf(owner, treeId);
    expect(after.tree.version).toBe(before.tree.version);
    expect(after.graph.people.find((person) => person.id === seed.people.ravi.id)?.nickname).toBeNull();
  });

  it('undo works through the endpoint: posting the returned inverse restores the previous graph', async () => {
    const { owner, treeId, seed } = await ownerWithSeedTree();
    const before = (await graphOf(owner, treeId)).graph;
    const edge = seed.graph.parentChildren.find((candidate) => candidate.childId === seed.people.samuel.id);
    expect(edge).toBeUndefined();
    const change = await owner.post(`/api/trees/${treeId}/changes`, {
      ops: [
        { op: 'union.update', id: seed.unions.vikramNisha.id, patch: { status: 'separated' } },
        { op: 'person.delete', id: seed.people.samuel.id },
      ],
    });
    expect(change.statusCode).toBe(200);
    const undo = await owner.post(`/api/trees/${treeId}/changes`, { ops: change.json().inverse });
    expect(undo.statusCode, undo.body).toBe(200);
    expect(sorted((await graphOf(owner, treeId)).graph)).toEqual(sorted(before));
  });

  it('never lets a client link a person to an arbitrary tree — linkedTreeId is server-managed', async () => {
    const { owner, treeId, seed } = await ownerWithSeedTree();
    const other = ctx.client();
    await signUpUser(other);
    const privateTree = (await other.post('/api/trees', { name: 'Private' })).json().tree;
    const ravi = seed.people.ravi.id;

    const update = await owner.post(`/api/trees/${treeId}/changes`, { ops: [{ op: 'person.update', id: ravi, patch: { linkedTreeId: privateTree.id } }] });
    expect(update.statusCode).toBe(400);
    expect(update.json().error.code).toBe('server_managed_field');

    const created = seed.graph.people.find((person) => person.id === seed.people.samuel.id);
    const create = await owner.post(`/api/trees/${treeId}/changes`, {
      ops: [{ op: 'person.create', person: { ...created, id: '77777777-0000-4000-8000-000000000001', linkedTreeId: privateTree.id } }],
    });
    expect(create.statusCode).toBe(400);
    expect((await graphOf(owner, treeId)).graph.people.some((person) => person.linkedTreeId === privateTree.id)).toBe(false);
  });

  it('only accepts photo URLs for files stored under this tree', async () => {
    const { owner, treeId, seed } = await ownerWithSeedTree();
    const ravi = seed.people.ravi.id;
    for (const photoUrl of ['https://tracker.example/pixel.gif', 'javascript:alert(1)', '/api/files/trees/00000000-0000-4000-8000-000000000000/photo.webp', '/api/files/avatars/x.webp']) {
      const response = await owner.post(`/api/trees/${treeId}/changes`, { ops: [{ op: 'person.update', id: ravi, patch: { photoUrl } }] });
      expect(response.statusCode, photoUrl).toBe(400);
    }
    const ok = await owner.post(`/api/trees/${treeId}/changes`, { ops: [{ op: 'person.update', id: ravi, patch: { photoUrl: `/api/files/trees/${treeId}/people/${ravi}/a.webp` } }] });
    expect(ok.statusCode).toBe(200);
    const cleared = await owner.post(`/api/trees/${treeId}/changes`, { ops: [{ op: 'person.update', id: ravi, patch: { photoUrl: null } }] });
    expect(cleared.statusCode).toBe(200);
  });

  it('undoing a delete restores a person’s link and photo, which a client could not set itself', async () => {
    const { owner, treeId, seed } = await ownerWithSeedTree();
    const linked = (await owner.post('/api/trees', { name: 'Samuel’s own tree' })).json().tree;
    const samuel = seed.people.samuel.id;
    await ctx.deps.prisma.person.update({ where: { id: samuel }, data: { linkedTreeId: linked.id } });

    const deleted = await owner.post(`/api/trees/${treeId}/changes`, { ops: [{ op: 'person.delete', id: samuel }] });
    const inverse = deleted.json().inverse as ChangeOp[];
    expect(inverse[0]).toMatchObject({ op: 'person.create', restoreToken: expect.any(String) });
    expect((await owner.post(`/api/trees/${treeId}/changes`, { ops: inverse })).statusCode).toBe(200);
    expect((await graphOf(owner, treeId)).graph.people.find((person) => person.id === samuel)?.linkedTreeId).toBe(linked.id);
  });

  it('cannot touch records in another tree by guessing ids', async () => {
    const { seed } = await ownerWithSeedTree();
    const attacker = ctx.client();
    await signUpUser(attacker);
    const own = (await attacker.post('/api/trees', { name: 'Mine' })).json().tree;
    const response = await attacker.post(`/api/trees/${own.id}/changes`, {
      ops: [{ op: 'person.update', id: seed.people.ravi.id, patch: { firstName: 'Pwned' } }],
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toBe('That person is no longer in this tree.');
  });
});

describe('roles and redaction', () => {
  it('lets editors change the graph, and refuses viewers with a plain message', async () => {
    const { treeId, seed } = await ownerWithSeedTree();
    const editor = await member(treeId, 'editor');
    const viewer = await member(treeId, 'viewer');
    const op = { op: 'person.update', id: seed.people.asha.id, patch: { nickname: 'Ash' } };
    expect((await editor.post(`/api/trees/${treeId}/changes`, { ops: [op] })).statusCode).toBe(200);
    const denied = await viewer.post(`/api/trees/${treeId}/changes`, { ops: [op] });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.message).toBe('You can view this family tree but not change it.');
  });

  it('lets an editor delete someone and undo it', async () => {
    const { owner, treeId, seed } = await ownerWithSeedTree();
    const samuel = seed.people.samuel.id;
    const editor = await member(treeId, 'editor');
    const deleted = await editor.post(`/api/trees/${treeId}/changes`, { ops: [{ op: 'person.delete', id: samuel }] });
    expect(deleted.statusCode).toBe(200);
    const inverse = deleted.json().inverse as ChangeOp[];
    expect(inverse[0]).toMatchObject({ op: 'person.create', restoreToken: expect.any(String) });

    const undone = await editor.post(`/api/trees/${treeId}/changes`, { ops: inverse });
    expect(undone.statusCode, undone.body).toBe(200);
    expect((await graphOf(owner, treeId)).graph.people.some((person) => person.id === samuel)).toBe(true);
  });
});

describe('review status', () => {
  it('refuses edits while a tree is in review, with an explanation', async () => {
    const { owner, treeId, seed } = await ownerWithSeedTree();
    await ctx.deps.prisma.tree.update({ where: { id: treeId }, data: { status: 'in_review' } });
    const response = await owner.post(`/api/trees/${treeId}/changes`, {
      ops: [{ op: 'person.update', id: seed.people.ravi.id, patch: { nickname: 'Rav' } }],
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.message).toMatch(/editing is paused/);
  });

  it('returns an approved tree to draft on its next edit', async () => {
    const { owner, treeId, seed } = await ownerWithSeedTree();
    await ctx.deps.prisma.tree.update({ where: { id: treeId }, data: { status: 'approved' } });
    const response = await owner.post(`/api/trees/${treeId}/changes`, {
      ops: [{ op: 'person.update', id: seed.people.ravi.id, patch: { nickname: 'Rav' } }],
    });
    expect(response.json()).toMatchObject({ treeStatus: 'draft' });
  });
});

describe('account data includes trees', () => {
  it('summarises owned trees before deletion, exports them, and deletes them with the account', async () => {
    const { owner, treeId, seed } = await ownerWithSeedTree();
    const me = (await owner.get('/api/auth/me')).json().user;
    const summary = (await owner.get('/api/account/deletion-summary')).json();
    expect(summary.ownedTrees).toEqual([{ id: treeId, name: 'Sharma family', peopleCount: seed.graph.people.length }]);

    const exported = (await owner.get('/api/account/export')).json();
    expect(exported.trees[0].graph.people).toHaveLength(seed.graph.people.length);

    expect((await owner.delete('/api/account', { confirmEmail: me.email })).statusCode).toBe(204);
    expect(await ctx.deps.prisma.tree.count({ where: { id: treeId } })).toBe(0);
    expect(await ctx.deps.prisma.person.count({ where: { treeId } })).toBe(0);
  });
});
