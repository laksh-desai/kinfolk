import type { Page } from '@playwright/test';
import { graphToOps } from '../../../../packages/shared/src/fixtures/fixtureBuilder';
import { buildLargeTree } from '../../../../packages/shared/src/fixtures/largeTree';
import { buildSeedTree } from '../../../../packages/shared/src/fixtures/seedTree';

let namespace = Math.floor(Date.now() / 1000) % 100000;

async function csrf(page: Page): Promise<string> {
  await page.request.get('/api/auth/csrf');
  const cookie = (await page.context().cookies()).find((entry) => entry.name === 'kf_csrf');
  return cookie?.value ?? '';
}

export async function signUp(page: Page, firstName = 'Ravi'): Promise<string> {
  const email = `${firstName.toLowerCase()}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.com`;
  const response = await page.request.post('/api/auth/signup', {
    headers: { 'x-csrf-token': await csrf(page) },
    data: { firstName, lastName: 'Sharma', email, password: 'a long enough password' },
  });
  if (!response.ok()) throw new Error(`signup failed: ${response.status()} ${await response.text()}`);
  return email;
}

/** Creates a tree through the real API and fills it with the §4.5 seed family (or the 500-person tree). */
export async function createSeededTree(page: Page, which: 'seed' | 'large' = 'seed') {
  const token = await csrf(page);
  const created = await page.request.post('/api/trees', { headers: { 'x-csrf-token': token }, data: { name: which === 'seed' ? 'Sharma family' : 'Large family' } });
  const { tree } = (await created.json()) as { tree: { id: string } };
  namespace += 1;
  const seed = which === 'seed' ? buildSeedTree({ namespace }) : null;
  const graph = seed ? seed.graph : buildLargeTree();
  const ops = which === 'large' ? graphToOps(graph).map((op) => remapIds(op, namespace)) : graphToOps(graph);
  const response = await page.request.post(`/api/trees/${tree.id}/changes`, { headers: { 'x-csrf-token': token }, data: { ops } });
  if (!response.ok()) throw new Error(`seeding failed: ${response.status()} ${await response.text()}`);
  return { treeId: tree.id, seed };
}

/** The large-tree fixture has fixed ids; give each e2e run its own. */
function remapIds<T>(value: T, ns: number): T {
  const prefix = ns.toString(16).padStart(8, '0');
  return JSON.parse(JSON.stringify(value).replace(/0001a26e-0000-4000-8000-/g, `${prefix}-0000-4000-8000-`)) as T;
}
