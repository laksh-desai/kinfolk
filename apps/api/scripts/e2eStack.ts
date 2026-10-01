/**
 * Boots the whole app for Playwright with no Docker and no credentials: embedded Postgres,
 * migrations, the API with its development adapters (file mail outbox, filesystem storage,
 * development Google sign-in), and the Vite dev server.
 *
 * The API and Vite run inside this one process (not as child processes) so that when
 * Playwright stops the web server nothing is left holding the ports — on Windows, killed
 * parents leave orphaned children behind.
 */
import EmbeddedPostgres from 'embedded-postgres';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildApp } from '../src/app';
import { createDeps } from '../src/lib/deps';
import { parseEnv } from '../src/lib/env';

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webRoot = path.resolve(apiRoot, '../web');

const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5180);
const API_PORT = Number(process.env.E2E_API_PORT ?? 4180);
const e2eDir = path.join(apiRoot, 'var/e2e');

function portIsFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.listen(port, () => server.close(() => resolve(true)));
  });
}

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

for (const port of [WEB_PORT, API_PORT]) {
  if (!(await portIsFree(port))) {
    console.error(`Port ${port} is already in use — a previous e2e run may still be running. Stop it and retry.`);
    process.exit(1);
  }
}

rmSync(e2eDir, { recursive: true, force: true });
mkdirSync(path.join(e2eDir, 'mail'), { recursive: true });

const pgPort = await freePort();
const pg = new EmbeddedPostgres({
  databaseDir: mkdtempSync(path.join(os.tmpdir(), 'kinfolk-e2e-pg-')),
  user: 'kinfolk',
  password: 'kinfolk',
  port: pgPort,
  persistent: false,
  onLog: () => undefined,
});
await pg.initialise();
await pg.start();
await pg.createDatabase('kinfolk');
const DATABASE_URL = `postgres://kinfolk:kinfolk@localhost:${pgPort}/kinfolk`;

const prismaCli = createRequire(path.join(apiRoot, 'package.json')).resolve('prisma/build/index.js');
execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
  cwd: apiRoot,
  env: { ...process.env, DATABASE_URL },
  stdio: 'pipe',
});

const env = parseEnv({
  NODE_ENV: 'development',
  DATABASE_URL,
  API_PORT: String(API_PORT),
  API_URL: `http://localhost:${API_PORT}`,
  WEB_URL: `http://localhost:${WEB_PORT}`,
  SESSION_SECRET: 'e2e-session-secret-that-is-long-enough-000',
  MAIL_OUTBOX_DIR: path.join(e2eDir, 'mail'),
  LOCAL_STORAGE_DIR: path.join(e2eDir, 'storage'),
});
const deps = createDeps(env, apiRoot);
// Every journey signs up its own people, from one address, far faster than a person would:
// production limits (10 auth attempts a minute) reject the later specs with a 429. The limiter
// itself is covered by auth.test.ts, which sets a deliberately tiny limit.
const api = await buildApp(deps, {
  logger: false,
  authRateLimit: { max: 10_000, timeWindow: '1 minute' },
  inviteRateLimit: { max: 10_000, timeWindow: '1 minute' },
  globalRateLimit: { max: 1_000_000, timeWindow: '1 minute' },
});
await api.listen({ port: API_PORT, host: '127.0.0.1' });

process.env.API_PORT = String(API_PORT);
process.env.WEB_PORT = String(WEB_PORT);
const vitePath = createRequire(path.join(webRoot, 'package.json')).resolve('vite');
// Vite is a web dependency, not an api one, so only the surface used here is typed.
interface ViteModule {
  createServer(config: Record<string, unknown>): Promise<{ listen(): Promise<unknown>; close(): Promise<void> }>;
}
const vite = (await import(pathToFileURL(vitePath).href)) as ViteModule;
const web = await vite.createServer({
  root: webRoot,
  configFile: path.join(webRoot, 'vite.config.ts'),
  server: {
    port: WEB_PORT,
    strictPort: true,
    host: 'localhost',
    proxy: { '/api': { target: `http://127.0.0.1:${API_PORT}`, changeOrigin: false } },
  },
  logLevel: 'warn',
});
await web.listen();
console.warn(`e2e stack ready: web http://localhost:${WEB_PORT}, api http://localhost:${API_PORT}, postgres ${pgPort}`);

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await Promise.allSettled([web.close(), api.close()]);
  await deps.prisma.$disconnect().catch(() => undefined);
  await pg.stop().catch(() => undefined);
  process.exit(0);
}
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
process.on('SIGHUP', () => void stop());
// Playwright closes stdin when it tears the web server down.
process.stdin.on('end', () => void stop());
process.stdin.resume();
