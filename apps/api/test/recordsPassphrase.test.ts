import { graphToOps } from '@kinfolk/shared/fixtures/fixtureBuilder';
import { buildSeedTree } from '@kinfolk/shared/fixtures/seedTree';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, signUpUser, type TestContext } from './testApp';

const PASSPHRASE = 'a shared passphrase for records';
let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext({ envOverrides: { RECORDS_PASSPHRASE: PASSPHRASE } });
});

afterAll(async () => {
  await ctx.close();
});

const pdf = () => Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n', 'latin1');

let namespace = 0xa000;
async function ownerWithTree() {
  const owner = ctx.client();
  await signUpUser(owner);
  const tree = (await owner.post('/api/trees', { name: 'Records' })).json().tree;
  const seed = buildSeedTree({ namespace: (namespace += 1) });
  await owner.post(`/api/trees/${tree.id}/changes`, { ops: graphToOps(seed.graph) });
  return { owner, tree, person: seed.people.ravi.id };
}

/** The passphrase gate (ADR 037). The point of every case here is that the server enforces it. */
describe('public records behind a passphrase', () => {
  it('says a passphrase is wanted, and refuses an upload until it is given', async () => {
    const { owner, tree, person } = await ownerWithTree();
    expect((await owner.get('/api/records/state')).json()).toEqual({ required: true, unlocked: false });

    const locked = await owner.post(`/api/trees/${tree.id}/people/${person}/record/upload-target`, { contentType: 'application/pdf', size: 20 });
    expect(locked.statusCode).toBe(403);
    expect(locked.json().error.code).toBe('records_locked');

    expect((await owner.post('/api/records/unlock', { passphrase: 'not it' })).statusCode).toBe(403);
    expect((await owner.post('/api/records/unlock', { passphrase: PASSPHRASE })).statusCode).toBe(200);
    expect((await owner.get('/api/records/state')).json()).toEqual({ required: true, unlocked: true });

    const unlocked = await owner.post(`/api/trees/${tree.id}/people/${person}/record/upload-target`, { contentType: 'application/pdf', size: pdf().length });
    expect(unlocked.statusCode, unlocked.body).toBe(200);
  });

  it('will not serve the PDF to a member who has not given the passphrase', async () => {
    const { owner, tree, person } = await ownerWithTree();
    await owner.post('/api/records/unlock', { passphrase: PASSPHRASE });
    const file = pdf();
    const target = (await owner.post(`/api/trees/${tree.id}/people/${person}/record/upload-target`, { contentType: 'application/pdf', size: file.length })).json();
    await owner.put(target.url, file, { headers: { 'content-type': 'application/pdf' } });
    const { publicRecordUrl } = (await owner.post(`/api/trees/${tree.id}/people/${person}/record`, { key: target.key })).json();
    expect((await owner.get(publicRecordUrl)).statusCode).toBe(200);

    // The same person, in a browser that never gave the passphrase: the URL alone is not enough.
    const sameUserElsewhere = ctx.client();
    await signUpUser(sameUserElsewhere);
    await owner.post(`/api/trees/${tree.id}/access`, { email: 'x@example.com', role: 'viewer', name: 'X' });
    const locked = ctx.client();
    const { email } = await signUpUser(locked);
    const accessId = (await owner.post(`/api/trees/${tree.id}/access`, { email, role: 'editor', name: 'Editor' })).json().access.id;
    await locked.post(`/api/me/access-invites/${accessId}/accept`, {});
    expect((await locked.get(publicRecordUrl)).statusCode).toBe(404);

    // Give it, and the same request works.
    expect((await locked.post('/api/records/unlock', { passphrase: PASSPHRASE })).statusCode).toBe(200);
    expect((await locked.get(publicRecordUrl)).statusCode).toBe(200);
  });

  it('leaves photos alone — only records are gated', async () => {
    const { owner, tree, person } = await ownerWithTree();
    const jpeg = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#a88' } }).jpeg().toBuffer();
    const target = await owner.post(`/api/trees/${tree.id}/people/${person}/photo/upload-target`, { contentType: 'image/jpeg', size: jpeg.length });
    expect(target.statusCode).toBe(200);
    await owner.put(target.json().url, jpeg, { headers: { 'content-type': 'image/jpeg' } });
    // The whole upload, not just the first step: a photo never asks for the passphrase.
    const done = await owner.post(`/api/trees/${tree.id}/people/${person}/photo`, { key: target.json().key });
    expect(done.statusCode, done.body).toBe(200);
    expect(done.json().photoUrl).toMatch(/\.webp$/);
  });

  it('refuses to finish a record upload from a browser that never gave the passphrase', async () => {
    const owner = ctx.client();
    const { email, password } = await signUpUser(owner);
    const tree = (await owner.post('/api/trees', { name: 'Records' })).json().tree;
    const seed = buildSeedTree({ namespace: (namespace += 1) });
    await owner.post(`/api/trees/${tree.id}/changes`, { ops: graphToOps(seed.graph) });
    const person = seed.people.ravi.id;
    await owner.post('/api/records/unlock', { passphrase: PASSPHRASE });
    const file = pdf();
    const target = (await owner.post(`/api/trees/${tree.id}/people/${person}/record/upload-target`, { contentType: 'application/pdf', size: file.length })).json();
    await owner.put(target.url, file, { headers: { 'content-type': 'application/pdf' } });

    // The same account on another device: the grant is theirs, but every step of a record asks.
    const elsewhere = ctx.client();
    expect((await elsewhere.post('/api/auth/login', { email, password })).statusCode).toBe(200);
    const locked = await elsewhere.post(`/api/trees/${tree.id}/people/${person}/record`, { key: target.key });
    expect(locked.statusCode).toBe(403);
    expect(locked.json().error.code).toBe('records_locked');
  });
});

describe('public records with no passphrase configured', () => {
  it('asks for nothing, so a developer machine behaves as it did before', async () => {
    const open = await createTestContext();
    try {
      const owner = open.client();
      await signUpUser(owner);
      expect((await owner.get('/api/records/state')).json()).toEqual({ required: false, unlocked: true });
      const tree = (await owner.post('/api/trees', { name: 'Open' })).json().tree;
      const seed = buildSeedTree({ namespace: (namespace += 1) });
      await owner.post(`/api/trees/${tree.id}/changes`, { ops: graphToOps(seed.graph) });
      const target = await owner.post(`/api/trees/${tree.id}/people/${seed.people.ravi.id}/record/upload-target`, { contentType: 'application/pdf', size: 20 });
      expect(target.statusCode).toBe(200);
    } finally {
      await open.close();
    }
  });
});
