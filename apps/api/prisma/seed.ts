/**
 * Rebuilds the fixture data: a sign-in account that owns the §4.5 sample family and the
 * 500-person performance family. Idempotent — reruns replace the two trees.
 *
 *   pnpm db:seed
 */
import { PrismaClient } from '@prisma/client';
import { graphToOps } from '@kinfolk/shared/fixtures/fixtureBuilder';
import { buildLargeTree } from '@kinfolk/shared/fixtures/largeTree';
import { buildSeedTree } from '@kinfolk/shared/fixtures/seedTree';
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../src/lib/crypto';
import { commitChangeSet } from '../src/modules/graph/graphService';

const repoEnv = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env');
if (existsSync(repoEnv)) loadDotenv({ path: repoEnv, quiet: true });
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required to seed. See .env.example.');
  process.exit(1);
}

/**
 * The account the sample trees belong to. A deployment overrides both, so a preview can be
 * seeded with a real address for the people who are going to look at it, and a password that
 * was never written down in this repository (SEED_EMAIL / SEED_PASSWORD).
 */
export const SEED_EMAIL = process.env.SEED_EMAIL?.trim().toLowerCase() || 'seed@kinfolk.test';
export const SEED_PASSWORD = process.env.SEED_PASSWORD || 'kinfolk sample family';

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
const deps = { prisma, now: () => new Date() };

const passwordHash = await hashPassword(SEED_PASSWORD);
const user = await prisma.user.upsert({
  where: { email: SEED_EMAIL },
  // Re-seeding resets the password, which is how a preview's demo login gets rotated.
  update: { passwordHash },
  create: { email: SEED_EMAIL, firstName: 'Ravi', lastName: 'Sharma', passwordHash },
});

const trees = [
  { name: 'Sharma family (sample)', description: 'Every family structure Kinfolk supports, in one tree.', graph: buildSeedTree().graph },
  { name: 'Large family (500 people)', description: 'Six generations, for checking speed on big trees.', graph: buildLargeTree() },
];

for (const { name, description, graph } of trees) {
  await prisma.tree.deleteMany({ where: { ownerId: user.id, name } });
  const tree = await prisma.tree.create({ data: { name, description, ownerId: user.id } });
  const result = await commitChangeSet(deps, { treeId: tree.id, actorId: user.id, role: 'owner', ops: graphToOps(graph), description: 'Seed data' });
  console.log(`Seeded “${name}”: ${graph.people.length} people, ${graph.unions.length} unions (tree version ${result.version}).`);
}

console.log(`Sign in with ${SEED_EMAIL}${process.env.SEED_PASSWORD ? '' : ` / ${SEED_PASSWORD}`}`);
await prisma.$disconnect();
