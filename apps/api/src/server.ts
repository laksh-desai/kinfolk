import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app';
import { createDeps } from './lib/deps';
import { EnvValidationError, parseEnv, type Env } from './lib/env';

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

const deps = createDeps(env, apiRoot);
const app = await buildApp(deps, { logger: env.NODE_ENV !== 'test' });

const shutdown = async () => {
  await app.close();
  await deps.prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
