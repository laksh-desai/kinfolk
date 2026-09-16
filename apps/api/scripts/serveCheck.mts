/**
 * Checks that one process serves the real web build: the app at the root and at any screen URL,
 * hashed assets cached for a year, and API 404s still JSON. Uses the actual apps/web/dist.
 *
 *   pnpm --filter api exec tsx scripts/serveCheck.mts
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app';
import { createDeps } from '../src/lib/deps';
import { parseEnv } from '../src/lib/env';

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webDist = path.resolve(apiRoot, '../web/dist');

const env = parseEnv({
  NODE_ENV: 'development',
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://kinfolk:kinfolk@localhost:5432/kinfolk',
  SESSION_SECRET: 'serve-check-secret-that-is-long-enough-00',
});
const app = await buildApp(createDeps(env, apiRoot), { logger: false, webDist });
await app.ready();

const problems: string[] = [];
const check = (label: string, ok: boolean, detail: string) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label} — ${detail}`);
  if (!ok) problems.push(label);
};

const root = await app.inject({ method: 'GET', url: '/' });
check('app at /', root.statusCode === 200 && root.body.includes('<div id="root">'), `${root.statusCode} ${root.headers['cache-control']}`);

const deep = await app.inject({ method: 'GET', url: '/trees/abc/people/x/edit' });
check('app at a pasted screen URL', deep.statusCode === 200 && deep.body.includes('<div id="root">'), `${deep.statusCode} ${deep.headers['content-type']}`);

const scriptSrc = /<script[^>]+src="([^"]+)"/.exec(root.body)?.[1];
const asset = await app.inject({ method: 'GET', url: scriptSrc ?? '/assets/missing.js' });
check('hashed asset cached for a year', asset.statusCode === 200 && asset.headers['cache-control'] === 'public, max-age=31536000, immutable', `${scriptSrc} → ${asset.statusCode} ${asset.headers['cache-control']}`);

const missing = await app.inject({ method: 'GET', url: '/api/nope' });
check('unknown API route stays JSON', missing.statusCode === 404 && String(missing.headers['content-type']).includes('json'), `${missing.statusCode} ${missing.body}`);

await app.close();
if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s): ${problems.join(', ')}`);
  process.exit(1);
}
console.log('\nOne process serves the whole product.');
