import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app';
import { createDeps } from './lib/deps';
import { devAdaptersInUse, EnvValidationError, parseEnv, type Env } from './lib/env';
import { createShutdown } from './lib/shutdown';

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoEnv = path.resolve(apiRoot, '../../.env');
if (existsSync(repoEnv)) loadDotenv({ path: repoEnv, quiet: true });

let env: Env;
try {
  env = parseEnv(process.env);
} catch (error) {
  if (error instanceof EnvValidationError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}

if (env.NODE_ENV === 'production' && env.ALLOW_DEV_ADAPTERS) {
  const lines = [
    '',
    '  ⚠  Kinfolk is running as a PREVIEW deployment (ALLOW_DEV_ADAPTERS=true).',
    ...devAdaptersInUse(env).map((service) => `     · ${service}`),
    '     Do not put real client data in it.',
    '',
  ];
  console.warn(lines.join('\n'));
}

const deps = createDeps(env, apiRoot);
// In production this process is the whole product: the API plus the built web app.
const webDist = path.resolve(apiRoot, '../web/dist');
const app = await buildApp(deps, {
  logger: env.NODE_ENV !== 'test',
  ...(env.NODE_ENV === 'production' && existsSync(path.join(webDist, 'index.html')) ? { webDist } : {}),
});

const shutdown = createShutdown({
  close: () => app.close(),
  disconnect: () => deps.prisma.$disconnect(),
  exit: (code) => process.exit(code),
  log: (message) => console.error(message),
});
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
