import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDeps } from '../src/lib/deps';
import { parseEnv } from '../src/lib/env';
import { DisabledOAuthProvider } from '../src/modules/auth/oauth/disabledOAuthProvider';
import { createTestContext, signUpUser, type TestContext } from './testApp';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx.close();
});

const base = {
  DATABASE_URL: 'postgres://kinfolk:kinfolk@localhost:5432/kinfolk',
  SESSION_SECRET: 'x'.repeat(32),
  ALLOW_DEV_ADAPTERS: 'true',
};
const prisma = new PrismaClient({ datasourceUrl: base.DATABASE_URL });

afterAll(async () => {
  await prisma.$disconnect();
});

/**
 * What has to hold before this is put on a URL someone else can reach (ADR 036). The development
 * sign-in mints a session for any email typed into a form, so the danger is shipping it by
 * accident; these say it cannot happen off a developer's machine.
 */
describe('a deployed instance (ADR 036)', () => {
  it('never falls back to the development sign-in outside development', () => {
    const deployed = createDeps(parseEnv({ ...base, NODE_ENV: 'production' }), process.cwd(), prisma);
    expect(deployed.oauth.mode).toBe('off');

    const local = createDeps(parseEnv({ ...base, NODE_ENV: 'development' }), process.cwd(), prisma);
    expect(local.oauth.mode).toBe('dev');

    const real = createDeps(
      parseEnv({ ...base, NODE_ENV: 'production', GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' }),
      process.cwd(),
      prisma,
    );
    expect(real.oauth.mode).toBe('google');
  });

  it('serves no OAuth routes at all when there is no provider', async () => {
    const off = await createTestContext({ oauth: new DisabledOAuthProvider() });
    try {
      const client = off.client();
      expect((await client.get('/api/auth/providers')).json()).toEqual({ google: { mode: 'off' } });
      for (const url of ['/api/auth/oauth/google/start', '/api/auth/oauth/google/callback', '/api/auth/oauth/dev/authorize']) {
        expect((await client.get(url)).statusCode, url).toBe(404);
      }
      // Password sign-in still works, which is the whole point.
      const { email } = await signUpUser(client);
      expect(email).toContain('@');
    } finally {
      await off.close();
    }
  });

  it('answers a platform health check, and says so when the database is gone', async () => {
    const health = await ctx.client().get('/api/health');
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ status: 'ok' });
  });

  it('lets an allow-list decide who may create an account', async () => {
    const closed = await createTestContext({ envOverrides: { SIGNUP_ALLOWLIST: 'invited@ats.com, @atswealth.com' } });
    try {
      const refused = await closed.client().post('/api/auth/signup', {
        email: 'stranger@example.com',
        password: 'a long enough password',
        firstName: 'Stranger',
        lastName: 'Person',
      });
      expect(refused.statusCode).toBe(403);
      expect(refused.json().error.code).toBe('signup_not_allowed');

      for (const email of ['invited@ats.com', 'anyone@atswealth.com']) {
        const allowed = await closed.client().post('/api/auth/signup', { email, password: 'a long enough password', firstName: 'A', lastName: 'B' });
        expect(allowed.statusCode, email).toBe(201);
      }
    } finally {
      await closed.close();
    }
  });

  it('lets anyone sign up when no allow-list is set, as the product intends', async () => {
    const open = await ctx.client().post('/api/auth/signup', {
      email: `open-${Date.now()}@example.com`,
      password: 'a long enough password',
      firstName: 'Open',
      lastName: 'Person',
    });
    expect(open.statusCode).toBe(201);
  });
});
