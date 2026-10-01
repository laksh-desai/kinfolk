import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from './testApp';

/**
 * Production serving (SPEC §9): one process answers the API and the app. A pasted URL for any
 * screen must return the app, hashed assets must be cacheable forever, and index.html never.
 */
describe('serving the built web app', () => {
  let ctx: TestContext;
  const dist = mkdtempSync(path.join(tmpdir(), 'kinfolk-dist-'));

  beforeAll(async () => {
    mkdirSync(path.join(dist, 'assets'), { recursive: true });
    writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>Kinfolk</title><div id="root"></div>');
    // Big enough to be worth compressing: the real chunks are hundreds of kilobytes.
    writeFileSync(path.join(dist, 'assets', 'index-abc123.js'), `console.log("app");\n${'// padding\n'.repeat(200)}`);
    writeFileSync(path.join(dist, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    ctx = await createTestContext({ webDist: dist });
  });

  afterAll(async () => {
    await ctx.close();
    rmSync(dist, { recursive: true, force: true });
  });

  it('serves the app at the root, and again for any screen someone pastes or refreshes', async () => {
    const client = ctx.client();
    for (const url of ['/', '/login', '/trees/11111111-1111-4111-8111-111111111111/people/x/edit', '/s/some-token']) {
      const response = await client.get(url);
      expect(response.statusCode, url).toBe(200);
      expect(response.body, url).toContain('<div id="root">');
      expect(response.headers['cache-control'], url).toBe('no-store');
    }
  });

  it('caches hashed assets forever and other files not at all', async () => {
    const client = ctx.client();
    const asset = await client.get('/assets/index-abc123.js');
    expect(asset.statusCode).toBe(200);
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    const favicon = await client.get('/favicon.svg');
    expect(favicon.statusCode).toBe(200);
    expect(favicon.headers['cache-control']).toBe('no-store');
  });

  it('compresses the app and its chunks for a browser that asks', async () => {
    const client = ctx.client();
    const asset = await client.get('/assets/index-abc123.js', { headers: { 'accept-encoding': 'gzip' } });
    expect(asset.statusCode).toBe(200);
    expect(asset.headers['content-encoding']).toBe('gzip');
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    // Plain for a client that did not ask.
    expect((await client.get('/assets/index-abc123.js')).headers['content-encoding']).toBeUndefined();
  });

  it('still answers unknown API routes and non-GET requests with JSON, not the app', async () => {
    const client = ctx.client();
    const missing = await client.get('/api/nope');
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('not_found');
    const posted = await client.post('/not-a-route', {});
    expect(posted.statusCode).toBe(404);
    expect(posted.json().error.code).toBe('not_found');
  });
});
