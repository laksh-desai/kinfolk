import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, signUpUser, type TestClient, type TestContext } from './testApp';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx.close();
});

async function createTree(client: TestClient, name = 'Sharma family') {
  const response = await client.post('/api/trees', { name, description: 'Mum and Dad’s side' });
  expect(response.statusCode).toBe(201);
  return response.json().tree as { id: string; name: string; role: string };
}

async function grant(treeId: string, userId: string, email: string, role: 'editor' | 'viewer') {
  await ctx.deps.prisma.access.create({ data: { treeId, userId, email, role, status: 'active', acceptedAt: new Date() } });
}

describe('trees', () => {
  it('creates a tree and lists it for its owner only', async () => {
    const owner = ctx.client();
    await signUpUser(owner);
    const tree = await createTree(owner);
    expect(tree.role).toBe('owner');

    const list = (await owner.get('/api/trees')).json().trees;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: tree.id, name: 'Sharma family', role: 'owner', peopleCount: 0, status: 'draft' });

    const stranger = ctx.client();
    await signUpUser(stranger);
    expect((await stranger.get('/api/trees')).json().trees).toEqual([]);
  });

  it('answers 404 — not 403 — to someone with no access, so tree ids reveal nothing', async () => {
    const owner = ctx.client();
    await signUpUser(owner);
    const tree = await createTree(owner);
    const stranger = ctx.client();
    await signUpUser(stranger);
    for (const url of [`/api/trees/${tree.id}`, `/api/trees/${tree.id}/graph`, '/api/trees/not-a-uuid']) {
      const response = await stranger.get(url);
      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('tree_not_found');
    }
    expect((await ctx.app.inject({ method: 'GET', url: `/api/trees/${tree.id}` })).statusCode).toBe(401);
  });

  it('lists shared trees with the caller’s role', async () => {
    const owner = ctx.client();
    await signUpUser(owner);
    const tree = await createTree(owner, 'Rao family');
    const editor = ctx.client();
    const { user, email } = await signUpUser(editor);
    await grant(tree.id, user.id, email, 'editor');
    const list = (await editor.get('/api/trees')).json().trees;
    expect(list).toEqual([expect.objectContaining({ id: tree.id, role: 'editor', owner: expect.objectContaining({ name: 'Asha Rao' }) })]);
  });

  it('lets only the owner rename, checked server-side per request', async () => {
    const owner = ctx.client();
    await signUpUser(owner);
    const tree = await createTree(owner);
    const editor = ctx.client();
    const { user, email } = await signUpUser(editor);
    await grant(tree.id, user.id, email, 'editor');

    const denied = await editor.patch(`/api/trees/${tree.id}`, { name: 'Hijacked' });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.message).toBe('Only the tree owner can rename it.');

    const renamed = await owner.patch(`/api/trees/${tree.id}`, { name: 'The Sharmas' });
    expect(renamed.json().tree.name).toBe('The Sharmas');
    const empty = await owner.patch(`/api/trees/${tree.id}`, { name: '   ' });
    expect(empty.json().error.fields.name).toBe('Give the tree a name.');
  });

  it('deletes a tree only when its exact name is typed, and only for the owner', async () => {
    const owner = ctx.client();
    await signUpUser(owner);
    const tree = await createTree(owner, 'Walker family');
    const viewer = ctx.client();
    const { user, email } = await signUpUser(viewer);
    await grant(tree.id, user.id, email, 'viewer');

    expect((await viewer.delete(`/api/trees/${tree.id}`, { confirmName: 'Walker family' })).statusCode).toBe(403);
    const wrong = await owner.delete(`/api/trees/${tree.id}`, { confirmName: 'walker' });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json().error.fields.confirmName).toMatch(/exactly/);
    expect((await owner.delete(`/api/trees/${tree.id}`, {})).statusCode).toBe(400);

    expect((await owner.delete(`/api/trees/${tree.id}`, { confirmName: 'Walker family' })).statusCode).toBe(204);
    expect((await owner.get(`/api/trees/${tree.id}`)).statusCode).toBe(404);
    expect(await ctx.deps.prisma.access.count({ where: { treeId: tree.id } })).toBe(0);
  });
});
