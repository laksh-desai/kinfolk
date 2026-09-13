/**
 * Runs a persistent local Postgres 17 from npm binaries for machines without Docker.
 * Data lives in <repo>/.pgdata. Prints the DATABASE_URL to put in your .env, then keeps
 * running until Ctrl+C.
 *
 *   pnpm --filter api db:embedded
 */
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, '../../../.pgdata');
const port = Number(process.env.EMBEDDED_PG_PORT ?? 5432);

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'kinfolk',
  password: 'kinfolk',
  port,
  persistent: true,
  onLog: () => undefined,
});

if (!existsSync(path.join(dataDir, 'PG_VERSION'))) {
  await pg.initialise();
}
await pg.start();
try {
  await pg.createDatabase('kinfolk');
} catch {
  // already exists
}
console.log(`Postgres is running. DATABASE_URL=postgres://kinfolk:kinfolk@localhost:${port}/kinfolk`);

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
