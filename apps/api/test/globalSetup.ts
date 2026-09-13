import EmbeddedPostgres from 'embedded-postgres';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    adminDatabaseUrl: string;
    templateDatabase: string;
  }
}

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TEMPLATE_DATABASE = 'kinfolk_template';

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

/** Real Postgres 17 for integration tests — no Docker needed. One template DB, migrated once. */
export default async function setup(project: TestProject) {
  const port = await freePort();
  const pg = new EmbeddedPostgres({
    databaseDir: mkdtempSync(path.join(os.tmpdir(), 'kinfolk-test-pg-')),
    user: 'kinfolk',
    password: 'kinfolk',
    port,
    persistent: false,
    onLog: () => undefined,
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase(TEMPLATE_DATABASE);

  const base = `postgres://kinfolk:kinfolk@localhost:${port}`;
  const prismaCli = createRequire(path.join(apiRoot, 'package.json')).resolve('prisma/build/index.js');
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: `${base}/${TEMPLATE_DATABASE}` },
    stdio: 'pipe',
  });

  project.provide('adminDatabaseUrl', `${base}/postgres`);
  project.provide('templateDatabase', TEMPLATE_DATABASE);

  return async () => {
    await pg.stop();
  };
}
