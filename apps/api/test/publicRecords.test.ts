import { graphToOps } from '@kinfolk/shared/fixtures/fixtureBuilder';
import { buildSeedTree } from '@kinfolk/shared/fixtures/seedTree';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, signUpUser, type TestContext } from './testApp';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx.close();
});

/** A real, minimal PDF: the server reads the bytes, so a fake one has to start like one. */
const pdf = (marker = 'public records') => Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n% ${marker}\n%%EOF\n`, 'latin1');

let namespace = 0x9000;
async function ownerWithTree() {
  const owner = ctx.client();
  await signUpUser(owner);
  const tree = (await owner.post('/api/trees', { name: 'Records' })).json().tree;
  const seed = buildSeedTree({ namespace: (namespace += 1) });
  await owner.post(`/api/trees/${tree.id}/changes`, { ops: graphToOps(seed.graph) });
  return { owner, tree, seed };
}

describe('public records (ADR 034)', () => {
  it('attaches a PDF to a person, opens it inline for members, and hides it from everyone else', async () => {
    const { owner, tree, seed } = await ownerWithTree();
    const ravi = seed.people.ravi.id;
    const file = pdf();

    const target = (await owner.post(`/api/trees/${tree.id}/people/${ravi}/record/upload-target`, { contentType: 'application/pdf', size: file.length })).json();
    expect((await owner.put(target.url, file, { headers: { 'content-type': 'application/pdf' } })).statusCode).toBe(204);
    const done = await owner.post(`/api/trees/${tree.id}/people/${ravi}/record`, { key: target.key });
    expect(done.statusCode, done.body).toBe(200);
    const { publicRecordUrl } = done.json();
    expect(publicRecordUrl).toMatch(new RegExp(`^/api/files/trees/${tree.id}/people/${ravi}/records/[0-9a-f-]+\\.pdf$`));

    // Attaching is an ordinary change: audited, and undone by clearing the field.
    const attach = await owner.post(`/api/trees/${tree.id}/changes`, { ops: [{ op: 'person.update', id: ravi, patch: { publicRecordUrl } }] });
    expect(attach.statusCode, attach.body).toBe(200);
    expect(attach.json().inverse).toEqual([{ op: 'person.update', id: ravi, patch: { publicRecordUrl: null } }]);
    const graph = (await owner.get(`/api/trees/${tree.id}/graph`)).json().graph;
    expect(graph.people.find((person: { id: string }) => person.id === ravi).publicRecordUrl).toBe(publicRecordUrl);

    // Opening it: a PDF, shown in the tab rather than downloaded, and never sniffed as anything else.
    const opened = await owner.get(publicRecordUrl);
    expect(opened.statusCode).toBe(200);
    expect(opened.headers['content-type']).toBe('application/pdf');
    expect(opened.headers['content-disposition']).toBe('inline');
    expect(opened.headers['x-content-type-options']).toBe('nosniff');

    const stranger = ctx.client();
    await signUpUser(stranger);
    expect((await stranger.get(publicRecordUrl)).statusCode).toBe(404);
  });

  it('refuses anything that is not a PDF, however it is labelled', async () => {
    const { owner, tree, seed } = await ownerWithTree();
    const ravi = seed.people.ravi.id;
    const notPdf = Buffer.from('GIF89a this is not a pdf', 'latin1');

    const target = (await owner.post(`/api/trees/${tree.id}/people/${ravi}/record/upload-target`, { contentType: 'application/pdf', size: notPdf.length })).json();
    await owner.put(target.url, notPdf, { headers: { 'content-type': 'application/pdf' } });
    const done = await owner.post(`/api/trees/${tree.id}/people/${ravi}/record`, { key: target.key });
    expect(done.statusCode).toBe(400);
    expect(done.json().error.message).toMatch(/PDF/);

    const wrongType = await owner.post(`/api/trees/${tree.id}/people/${ravi}/record/upload-target`, { contentType: 'image/png', size: 100 });
    expect(wrongType.statusCode).toBe(400);
    expect(wrongType.json().error.fields.contentType).toBe('Public records have to be a PDF.');
  });

  it('never lets a client point a person at a file outside their own tree', async () => {
    const { owner, tree, seed } = await ownerWithTree();
    const ravi = seed.people.ravi.id;
    for (const url of [
      'https://example.com/records.pdf',
      `/api/files/trees/00000000-0000-4000-8000-000000000001/people/${ravi}/records/11111111-1111-4111-8111-111111111111.pdf`,
      `/api/files/trees/${tree.id}/people/${ravi}/records/../../../../secrets.pdf`,
    ]) {
      const response = await owner.post(`/api/trees/${tree.id}/changes`, { ops: [{ op: 'person.update', id: ravi, patch: { publicRecordUrl: url } }] });
      expect(response.statusCode, url).toBe(400);
      expect(response.json().error.code).toBe('server_managed_field');
    }
  });

  it('refuses uploads from viewers, and from members of another tree', async () => {
    const { owner, tree, seed } = await ownerWithTree();
    const ravi = seed.people.ravi.id;
    const viewer = ctx.client();
    const { email } = await signUpUser(viewer);
    const accessId = (await owner.post(`/api/trees/${tree.id}/access`, { email, role: 'viewer', name: 'Viewer' })).json().access.id;
    await viewer.post(`/api/me/access-invites/${accessId}/accept`, {});

    const refused = await viewer.post(`/api/trees/${tree.id}/people/${ravi}/record/upload-target`, { contentType: 'application/pdf', size: 100 });
    expect(refused.statusCode).toBe(403);

    const other = await ownerWithTree();
    const wrongTree = await other.owner.post(`/api/trees/${other.tree.id}/people/${ravi}/record/upload-target`, { contentType: 'application/pdf', size: 100 });
    expect(wrongTree.statusCode).toBe(404);
  });
});
