import { PrismaClient } from '@prisma/client';
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inject } from 'vitest';
import { buildApp, type BuildAppOptions } from '../src/app';
import type { AppDeps } from '../src/lib/deps';
import { parseEnv, type Env } from '../src/lib/env';
import { FileMailer } from '../src/lib/mailer/fileMailer';
import { FsStorage } from '../src/lib/storage/fsStorage';
import { DevOAuthProvider } from '../src/modules/auth/oauth/devOAuthProvider';

async function createDatabase(): Promise<string> {
  const adminUrl = inject('adminDatabaseUrl');
  const template = inject('templateDatabase');
  const name = `test_${randomUUID().replaceAll('-', '')}`;
  const admin = new PrismaClient({ datasourceUrl: adminUrl });
  try {
    for (let attempt = 0; ; attempt += 1) {
      try {
        await admin.$executeRawUnsafe(`CREATE DATABASE "${name}" TEMPLATE "${template}"`);
        break;
      } catch (error) {
        if (attempt >= 20) throw error;
        await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 200));
      }
    }
  } finally {
    await admin.$disconnect();
  }
  return adminUrl.replace(/\/postgres$/, `/${name}`);
}

export interface TestContext {
  app: FastifyInstance;
  deps: AppDeps;
  env: Env;
  mailer: FileMailer;
  storage: FsStorage;
  client: () => TestClient;
  /** Freezes deps.now() for expiry tests; null restores the real clock. */
  setNow: (value: Date | null) => void;
  close: () => Promise<void>;
}

export async function createTestContext(
  options: BuildAppOptions & { envOverrides?: Record<string, string> } = {},
): Promise<TestContext> {
  const databaseUrl = await createDatabase();
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'kinfolk-test-'));
  const env = parseEnv({
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    SESSION_SECRET: 'test-secret-that-is-definitely-32-chars',
    WEB_URL: 'http://localhost:5173',
    API_URL: 'http://localhost:4000',
    ...options.envOverrides,
  });
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  const mailer = new FileMailer(path.join(scratch, 'mail'));
  const storage = new FsStorage(path.join(scratch, 'storage'), env.SESSION_SECRET);
  let clock: Date | null = null;
  const deps: AppDeps = {
    env,
    prisma,
    mailer,
    storage,
    oauth: new DevOAuthProvider(env.SESSION_SECRET),
    now: () => clock ?? new Date(),
  };
  const app = await buildApp(deps, {
    authRateLimit: options.authRateLimit ?? { max: 10_000, timeWindow: '1 minute' },
    inviteRateLimit: options.inviteRateLimit ?? { max: 10_000, timeWindow: '1 minute' },
  });
  await app.ready();
  return {
    app,
    deps,
    env,
    mailer,
    storage,
    client: () => new TestClient(app),
    setNow: (value) => {
      clock = value;
    },
    close: async () => {
      await app.close();
      await prisma.$disconnect();
    },
  };
}

interface StoredCookie {
  value: string;
  path: string;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** A cookie-jar client that behaves like a browser: path-scoped cookies and the CSRF header. */
export class TestClient {
  readonly jar = new Map<string, StoredCookie>();

  constructor(private readonly app: FastifyInstance) {}

  private cookieHeader(url: string): string {
    const pathname = url.split('?')[0] ?? url;
    return [...this.jar.entries()]
      .filter(([, cookie]) => pathname === cookie.path || pathname.startsWith(cookie.path.endsWith('/') ? cookie.path : `${cookie.path}/`) || cookie.path === '/')
      .map(([name, cookie]) => `${name}=${cookie.value}`)
      .join('; ');
  }

  private store(response: LightMyRequestResponse): void {
    for (const cookie of response.cookies as Array<{ name: string; value: string; path?: string; maxAge?: number; expires?: Date }>) {
      const expired = cookie.maxAge === 0 || (cookie.expires !== undefined && cookie.expires.getTime() <= Date.now());
      if (expired || cookie.value === '') this.jar.delete(cookie.name);
      else this.jar.set(cookie.name, { value: cookie.value, path: cookie.path ?? '/' });
    }
  }

  async request(
    method: Method,
    url: string,
    payload?: unknown,
    extra: Partial<InjectOptions> = {},
  ): Promise<LightMyRequestResponse> {
    if (method !== 'GET' && !this.jar.has('kf_csrf')) {
      this.store(await this.app.inject({ method: 'GET', url: '/api/auth/csrf' }));
    }
    const headers: Record<string, string> = { cookie: this.cookieHeader(url) };
    const csrf = this.jar.get('kf_csrf');
    if (method !== 'GET' && csrf) headers['x-csrf-token'] = csrf.value;
    const response = await this.app.inject({
      method,
      url,
      ...(payload !== undefined ? { payload: payload as InjectOptions['payload'] } : {}),
      ...extra,
      headers: { ...headers, ...(extra.headers as Record<string, string> | undefined) },
    });
    this.store(response);
    return response;
  }

  get = (url: string, extra?: Partial<InjectOptions>) => this.request('GET', url, undefined, extra);
  post = (url: string, payload?: unknown, extra?: Partial<InjectOptions>) => this.request('POST', url, payload ?? {}, extra);
  put = (url: string, payload?: unknown, extra?: Partial<InjectOptions>) => this.request('PUT', url, payload, extra);
  patch = (url: string, payload?: unknown, extra?: Partial<InjectOptions>) => this.request('PATCH', url, payload ?? {}, extra);
  delete = (url: string, payload?: unknown, extra?: Partial<InjectOptions>) => this.request('DELETE', url, payload, extra);
}

let counter = 0;
export function uniqueEmail(prefix = 'user'): string {
  counter += 1;
  return `${prefix}.${Date.now()}.${counter}@example.com`;
}

export async function signUpUser(client: TestClient, overrides: Partial<{ email: string; firstName: string; lastName: string; password: string }> = {}) {
  const body = {
    firstName: 'Asha',
    lastName: 'Rao',
    email: uniqueEmail(),
    password: 'long enough password',
    ...overrides,
  };
  const response = await client.post('/api/auth/signup', body);
  if (response.statusCode !== 201) throw new Error(`signup failed: ${response.statusCode} ${response.body}`);
  return { ...body, user: (response.json() as { user: { id: string } }).user };
}

export async function latestMailTo(mailer: FileMailer, to: string) {
  const mail = (await mailer.list()).find((message) => message.to === to);
  if (!mail) throw new Error(`no mail to ${to}`);
  return mail;
}
