import { graphToOps } from '@kinfolk/shared/fixtures/fixtureBuilder';
import { buildSeedTree } from '@kinfolk/shared/fixtures/seedTree';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, signUpUser, type TestContext } from './testApp';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx.close();
});

describe('person photos', () => {
  it('uploads, resizes, attaches through an undoable edit, and serves only to tree members', async () => {
    const owner = ctx.client();
    await signUpUser(owner);
    const tree = (await owner.post('/api/trees', { name: 'Photos' })).json().tree;
    const seed = buildSeedTree({ namespace: 0x7070 });
    await owner.post(`/api/trees/${tree.id}/changes`, { ops: graphToOps(seed.graph) });
    const sita = seed.people.sita.id;

    const jpeg = await sharp({ create: { width: 800, height: 1000, channels: 3, background: '#a88' } }).jpeg().toBuffer();
    const target = (await owner.post(`/api/trees/${tree.id}/people/${sita}/photo/upload-target`, { contentType: 'image/jpeg', size: jpeg.length })).json();
    expect((await owner.put(target.url, jpeg, { headers: { 'content-type': 'image/jpeg' } })).statusCode).toBe(204);
    const done = await owner.post(`/api/trees/${tree.id}/people/${sita}/photo`, { key: target.key });
    expect(done.statusCode).toBe(200);
    const { photoUrl } = done.json();
    expect(photoUrl).toMatch(new RegExp(`^/api/files/trees/${tree.id}/people/${sita}/[0-9a-f-]+\\.webp$`));

    const attach = await owner.post(`/api/trees/${tree.id}/changes`, { ops: [{ op: 'person.update', id: sita, patch: { photoUrl } }] });
    expect(attach.statusCode).toBe(200);
    expect(attach.json().inverse).toEqual([{ op: 'person.update', id: sita, patch: { photoUrl: null } }]);

    const image = await owner.get(photoUrl, { headers: { 'accept-encoding': 'gzip, br' } });
    expect(image.statusCode).toBe(200);
    expect(image.headers['content-type']).toBe('image/webp');
    // Already compressed; gzipping it again would only cost CPU.
    expect(image.headers['content-encoding']).toBeUndefined();

    const stranger = ctx.client();
    await signUpUser(stranger);
    expect((await stranger.get(photoUrl)).statusCode).toBe(404);
    expect((await stranger.post(`/api/trees/${tree.id}/people/${sita}/photo/upload-target`, { contentType: 'image/jpeg', size: 10 })).statusCode).toBe(404);
  });

  it('refuses photo uploads from viewers and for people in other trees', async () => {
    const owner = ctx.client();
    await signUpUser(owner);
    const tree = (await owner.post('/api/trees', { name: 'Mine' })).json().tree;
    const viewer = ctx.client();
    const { user, email } = await signUpUser(viewer);
    await ctx.deps.prisma.access.create({ data: { treeId: tree.id, userId: user.id, email, role: 'viewer', status: 'active' } });
    const res = await viewer.post(`/api/trees/${tree.id}/people/00000000-0000-4000-8000-000000000000/photo/upload-target`, { contentType: 'image/png', size: 10 });
    expect(res.statusCode).toBe(403);
    const missing = await owner.post(`/api/trees/${tree.id}/people/00000000-0000-4000-8000-000000000000/photo/upload-target`, { contentType: 'image/png', size: 10 });
    expect(missing.statusCode).toBe(404);
  });
});
