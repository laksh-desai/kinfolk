/**
 * Starts a throwaway Postgres, runs one command with DATABASE_URL pointing at it, then
 * deletes it. Used to author migrations without Docker:
 *
 *   pnpm --filter api exec tsx scripts/withEmbeddedDb.ts prisma migrate dev --name add_x
 */
import EmbeddedPostgres from 'embedded-postgres';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';

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

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error('usage: withEmbeddedDb.ts <command> [...args]');
  process.exit(2);
}

const port = await freePort();
const pg = new EmbeddedPostgres({
  databaseDir: mkdtempSync(path.join(os.tmpdir(), 'kinfolk-pg-')),
  user: 'kinfolk',
  password: 'kinfolk',
  port,
  persistent: false,
  onLog: () => undefined,
});
await pg.initialise();
await pg.start();
await pg.createDatabase('kinfolk');

const DATABASE_URL = `postgres://kinfolk:kinfolk@localhost:${port}/kinfolk`;
const code = await new Promise<number>((resolve) => {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, DATABASE_URL },
  });
  child.on('exit', (exitCode) => resolve(exitCode ?? 1));
});
await pg.stop();
process.exit(code);
