import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { safeReturnTo } from '../src/modules/auth/authRoutes';
import { createTestContext, latestMailTo, signUpUser, uniqueEmail, type TestContext } from './testApp';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx.close();
});

describe('email + password', () => {
  it('signs up, sets httpOnly session cookies, and resolves /me', async () => {
    const client = ctx.client();
    const { email } = await signUpUser(client);

    const access = client.jar.get('kf_at');
    const refresh = client.jar.get('kf_rt');
    expect(access?.path).toBe('/api');
    expect(refresh?.path).toBe('/api/auth');

    const me = await client.get('/api/auth/me');
    expect(me.statusCode).toBe(200);
    expect(me.json().user.email).toBe(email);
    expect(me.json().user).not.toHaveProperty('passwordHash');
  });

  it('marks session cookies HttpOnly and SameSite, and never returns tokens in bodies', async () => {
    const client = ctx.client();
    await client.get('/api/auth/csrf');
    const response = await client.post('/api/auth/signup', {
      firstName: 'Lena',
      lastName: 'Ortiz',
      email: uniqueEmail(),
      password: 'long enough password',
    });
    const setCookie = ([] as string[]).concat(response.headers['set-cookie'] ?? []);
    const at = setCookie.find((value) => value.startsWith('kf_at='));
    const rt = setCookie.find((value) => value.startsWith('kf_rt='));
    expect(at).toMatch(/HttpOnly/i);
    expect(at).toMatch(/SameSite=Lax/i);
    expect(rt).toMatch(/HttpOnly/i);
    expect(rt).toMatch(/SameSite=Strict/i);
    expect(response.body).not.toContain(client.jar.get('kf_at')?.value ?? '---');
  });

  it('rejects a duplicate email with a field message', async () => {
    const client = ctx.client();
    const { email } = await signUpUser(client);
    const again = await ctx.client().post('/api/auth/signup', {
      firstName: 'A',
      lastName: 'B',
      email: email.toUpperCase(),
      password: 'long enough password',
    });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.fields.email).toMatch(/already exists/);
  });

  it('returns every invalid field for an empty signup, using the shared schema', async () => {
    const response = await ctx.client().post('/api/auth/signup', {});
    expect(response.statusCode).toBe(400);
    const { fields } = response.json().error;
    expect(Object.keys(fields).sort()).toEqual(['email', 'firstName', 'lastName', 'password']);
    expect(fields.firstName).toBe('Enter your first name.');
  });

  it('rejects a wrong password with a plain-language message', async () => {
    const client = ctx.client();
    const { email } = await signUpUser(client);
    const response = await ctx.client().post('/api/auth/login', { email, password: 'not the password' });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.message).toBe("That email and password don't match an account.");
  });

  it('logs in, logs out, and the old access cookie stops working immediately', async () => {
    const setup = ctx.client();
    const { email, password } = await signUpUser(setup);
    const client = ctx.client();
    expect((await client.post('/api/auth/login', { email, password })).statusCode).toBe(200);
    const stolenAccess = client.jar.get('kf_at')?.value;

    expect((await client.post('/api/auth/logout')).statusCode).toBe(204);
    expect(client.jar.has('kf_at')).toBe(false);

    const replay = await ctx.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: `kf_at=${stolenAccess}` },
    });
    expect(replay.statusCode).toBe(401);
    expect(replay.json().error.code).toBe('unauthorized');
  });
});

describe('refresh tokens', () => {
  it('rotates the refresh token and keeps the user signed in', async () => {
    const client = ctx.client();
    await signUpUser(client);
    const first = client.jar.get('kf_rt')?.value;
    const response = await client.post('/api/auth/refresh');
    expect(response.statusCode).toBe(200);
    expect(client.jar.get('kf_rt')?.value).not.toBe(first);
    expect((await client.get('/api/auth/me')).statusCode).toBe(200);
  });

  it('401s consistently without cookies, with a garbage token, and with an expired access token', async () => {
    const client = ctx.client();
    await signUpUser(client);
    const noCookie = await ctx.app.inject({ method: 'GET', url: '/api/auth/me' });
    const garbage = await ctx.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: 'kf_at=abc.def' } });
    ctx.setNow(new Date(Date.now() + 16 * 60_000));
    const expired = await client.get('/api/auth/me');
    ctx.setNow(null);
    for (const response of [noCookie, garbage, expired]) {
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: { code: 'unauthorized', message: 'Your session has ended. Please sign in again.' },
      });
    }
  });

  it('treats replay of a rotated-out refresh token (after the grace window) as theft and revokes the session', async () => {
    const client = ctx.client();
    await signUpUser(client);
    const original = client.jar.get('kf_rt')?.value;
    const csrf = client.jar.get('kf_csrf')?.value ?? '';
    expect((await client.post('/api/auth/refresh')).statusCode).toBe(200);

    ctx.setNow(new Date(Date.now() + 60_000));
    const replay = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { cookie: `kf_rt=${original}; kf_csrf=${csrf}`, 'x-csrf-token': csrf },
    });
    expect(replay.statusCode).toBe(401);

    // The legitimate holder is now signed out too.
    const legit = await client.post('/api/auth/refresh');
    ctx.setNow(null);
    expect(legit.statusCode).toBe(401);
  });

  it('tolerates two tabs refreshing with the same token at once', async () => {
    const client = ctx.client();
    await signUpUser(client);
    const original = client.jar.get('kf_rt')?.value;
    const csrf = client.jar.get('kf_csrf')?.value ?? '';
    expect((await client.post('/api/auth/refresh')).statusCode).toBe(200);
    const secondTab = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { cookie: `kf_rt=${original}; kf_csrf=${csrf}`, 'x-csrf-token': csrf },
    });
    expect(secondTab.statusCode).toBe(200);
  });
});

describe('CSRF', () => {
  it('blocks a state-changing request without the double-submit token', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'a@example.com', password: 'x' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('csrf_failed');
  });

  it('uses a referrer policy that lets browsers send a real Origin on form posts', async () => {
    // With helmet's default "no-referrer", Chrome sends `Origin: null` on HTML form POSTs and the
    // Origin check rejects them (found by the e2e dev Google sign-in test).
    const page = await ctx.client().get('/api/auth/oauth/dev/authorize?state=x');
    expect(page.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  it('blocks a request from a foreign Origin even with a token', async () => {
    const client = ctx.client();
    const response = await client.post(
      '/api/auth/login',
      { email: 'a@example.com', password: 'x' },
      { headers: { origin: 'https://evil.example' } },
    );
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('bad_origin');
  });
});

describe('forgot password', () => {
  it('emails a code, verifies it, resets the password, and signs in — surviving a page refresh between steps', async () => {
    const setup = ctx.client();
    const { email } = await signUpUser(setup);
    const client = ctx.client();

    expect((await client.get('/api/auth/password/status')).json().stage).toBe('none');
    const requested = await client.post('/api/auth/password/forgot', { email });
    expect(requested.statusCode).toBe(202);
    // A refresh of /forgot-password/verify re-reads this; the email is never in a URL.
    expect((await client.get('/api/auth/password/status')).json().stage).toBe('pending');

    const mail = await latestMailTo(ctx.mailer, email);
    const code = /\b(\d{6})\b/.exec(mail.text)?.[1];
    expect(code).toBeDefined();

    const wrong = await client.post('/api/auth/password/verify', { code: code === '000000' ? '111111' : '000000' });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json().error.fields.code).toMatch(/isn't right/);

    expect((await client.post('/api/auth/password/verify', { code })).statusCode).toBe(200);
    expect((await client.get('/api/auth/password/status')).json().stage).toBe('verified');

    const reset = await client.post('/api/auth/password/reset', {
      password: 'a brand new password',
      confirmPassword: 'a brand new password',
    });
    expect(reset.statusCode).toBe(200);
    expect((await client.get('/api/auth/me')).statusCode).toBe(200);

    // Old sessions were revoked; the new password works.
    expect((await setup.get('/api/auth/me')).statusCode).toBe(401);
    const login = await ctx.client().post('/api/auth/login', { email, password: 'a brand new password' });
    expect(login.statusCode).toBe(200);
  });

  it('responds identically for an unknown email and sends nothing', async () => {
    const email = uniqueEmail('nobody');
    const client = ctx.client();
    const response = await client.post('/api/auth/password/forgot', { email });
    expect(response.statusCode).toBe(202);
    expect((await client.get('/api/auth/password/status')).json().stage).toBe('pending');
    expect((await ctx.mailer.list()).some((mail) => mail.to === email)).toBe(false);
    const verify = await client.post('/api/auth/password/verify', { code: '123456' });
    expect(verify.statusCode).toBe(400);
  });

  it('locks the code after five wrong attempts', async () => {
    const setup = ctx.client();
    const { email } = await signUpUser(setup);
    const client = ctx.client();
    await client.post('/api/auth/password/forgot', { email });
    const mail = await latestMailTo(ctx.mailer, email);
    const code = /\b(\d{6})\b/.exec(mail.text)?.[1] ?? '';
    const wrongCode = code === '999999' ? '888888' : '999999';
    for (let i = 0; i < 5; i += 1) await client.post('/api/auth/password/verify', { code: wrongCode });
    const locked = await client.post('/api/auth/password/verify', { code });
    expect(locked.statusCode).toBe(400);
    expect(locked.json().error.fields.code).toMatch(/Too many/);
  });

  it('refuses the reset step without a verified code', async () => {
    const response = await ctx.client().post('/api/auth/password/reset', {
      password: 'a brand new password',
      confirmPassword: 'a brand new password',
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('Google OAuth (development provider, same session code path)', () => {
  it('runs start → consent → callback → session, and returns to the requested page', async () => {
    const client = ctx.client();
    const start = await client.get('/api/auth/oauth/google/start?returnTo=%2Ftrees%2Fabc');
    expect(start.statusCode).toBe(302);
    const authorizeUrl = start.headers.location as string;
    expect(authorizeUrl.startsWith('/api/auth/oauth/dev/authorize?state=')).toBe(true);
    const state = new URL(authorizeUrl, 'http://x').searchParams.get('state') ?? '';

    const page = await client.get(authorizeUrl);
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('Development Google sign-in');

    const email = uniqueEmail('google');
    const consent = await client.request(
      'POST',
      '/api/auth/oauth/dev/authorize',
      new URLSearchParams({ state, email, firstName: 'Gia', lastName: 'Nguyen', _csrf: client.jar.get('kf_csrf')?.value ?? '' }).toString(),
      { headers: { 'content-type': 'application/x-www-form-urlencoded' } },
    );
    expect(consent.statusCode).toBe(302);

    const callback = await client.get(consent.headers.location as string);
    expect(callback.statusCode).toBe(302);
    expect(callback.headers.location).toBe('http://localhost:5173/trees/abc');

    const me = await client.get('/api/auth/me');
    expect(me.statusCode).toBe(200);
    expect(me.json().user).toMatchObject({ email, firstName: 'Gia', hasPassword: false });
  });

  it('rejects a callback whose state does not match the cookie', async () => {
    const client = ctx.client();
    await client.get('/api/auth/oauth/google/start');
    const callback = await client.get('/api/auth/oauth/google/callback?code=abc&state=forged');
    expect(callback.statusCode).toBe(302);
    expect(callback.headers.location).toBe('http://localhost:5173/login?oauth=expired');
    expect((await client.get('/api/auth/me')).statusCode).toBe(401);
  });

  it('only allows same-site relative return paths', () => {
    expect(safeReturnTo('/trees/1')).toBe('/trees/1');
    expect(safeReturnTo('//evil.example')).toBe('/');
    expect(safeReturnTo('https://evil.example')).toBe('/');
    expect(safeReturnTo('/\\evil.example')).toBe('/');
    expect(safeReturnTo(undefined)).toBe('/');
  });
});

describe('rate limiting', () => {
  it('limits repeated sign-in attempts with a plain message', async () => {
    const limited = await createTestContext({ authRateLimit: { max: 3, timeWindow: '1 minute' } });
    try {
      const client = limited.client();
      let last = await client.post('/api/auth/login', { email: 'x@example.com', password: 'nope' });
      for (let i = 0; i < 3; i += 1) last = await client.post('/api/auth/login', { email: 'x@example.com', password: 'nope' });
      expect(last.statusCode).toBe(429);
      expect(last.json().error.message).toMatch(/Too many attempts/);
    } finally {
      await limited.close();
    }
  });
});
