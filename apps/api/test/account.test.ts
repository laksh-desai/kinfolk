import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, signUpUser, uniqueEmail, type TestContext } from './testApp';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx.close();
});

describe('profile', () => {
  it('updates names, and requires the current password to change email', async () => {
    const client = ctx.client();
    const { password } = await signUpUser(client);
    const newEmail = uniqueEmail('moved');

    const blocked = await client.patch('/api/account', { firstName: 'Asha', lastName: 'Rao-Iyer', email: newEmail });
    expect(blocked.statusCode).toBe(400);
    expect(blocked.json().error.fields.currentPassword).toMatch(/current password/);

    const ok = await client.patch('/api/account', {
      firstName: 'Asha',
      lastName: 'Rao-Iyer',
      email: newEmail,
      currentPassword: password,
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().user).toMatchObject({ lastName: 'Rao-Iyer', email: newEmail });
  });

  it('changes the password and signs out other devices but not this one', async () => {
    const first = ctx.client();
    const { email, password } = await signUpUser(first);
    const other = ctx.client();
    await other.post('/api/auth/login', { email, password });

    const wrong = await first.post('/api/account/password', {
      currentPassword: 'nope',
      newPassword: 'another long password',
      confirmPassword: 'another long password',
    });
    expect(wrong.statusCode).toBe(400);

    const changed = await first.post('/api/account/password', {
      currentPassword: password,
      newPassword: 'another long password',
      confirmPassword: 'another long password',
    });
    expect(changed.statusCode).toBe(200);
    expect((await first.get('/api/auth/me')).statusCode).toBe(200);
    expect((await other.get('/api/auth/me')).statusCode).toBe(401);
  });

  it('limits password guesses on the account routes like it does on sign-in', async () => {
    const limited = await createTestContext({ authRateLimit: { max: 3, timeWindow: '1 minute' } });
    try {
      const client = limited.client();
      await signUpUser(client);
      const guess = { currentPassword: 'nope', newPassword: 'another long password', confirmPassword: 'another long password' };
      let last = await client.post('/api/account/password', guess);
      for (let i = 0; i < 3; i += 1) last = await client.post('/api/account/password', guess);
      expect(last.statusCode).toBe(429);
      // Changing the email verifies the password too, so it has a limit of its own.
      const move = { firstName: 'A', lastName: 'B', email: uniqueEmail('moved'), currentPassword: 'nope' };
      last = await client.patch('/api/account', move);
      for (let i = 0; i < 3; i += 1) last = await client.patch('/api/account', move);
      expect(last.statusCode).toBe(429);
    } finally {
      await limited.close();
    }
  });
});

describe('avatar upload', () => {
  it('uploads through a signed target, validates magic bytes, resizes to WebP, and serves only to signed-in users', async () => {
    const client = ctx.client();
    await signUpUser(client);
    const png = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#88aa99' } }).png().toBuffer();

    const target = await client.post('/api/account/avatar/upload-target', { contentType: 'image/png', size: png.length });
    expect(target.statusCode).toBe(200);
    const { url, key } = target.json();

    const put = await client.put(url, png, { headers: { 'content-type': 'image/png' } });
    expect(put.statusCode).toBe(204);

    const done = await client.post('/api/account/avatar', { key });
    expect(done.statusCode).toBe(200);
    const avatarUrl: string = done.json().user.avatarUrl;
    expect(avatarUrl).toMatch(/^\/api\/files\/avatars\/.+\.webp$/);

    const image = await client.get(avatarUrl);
    expect(image.statusCode).toBe(200);
    expect(image.headers['content-type']).toBe('image/webp');
    const meta = await sharp(image.rawPayload).metadata();
    expect([meta.width, meta.height]).toEqual([512, 512]);

    expect((await ctx.app.inject({ method: 'GET', url: avatarUrl })).statusCode).toBe(404);
  });

  it('rejects a file whose bytes are not an image even if it claims to be one', async () => {
    const client = ctx.client();
    await signUpUser(client);
    const fake = Buffer.from('<script>alert(1)</script>'.repeat(10));
    const target = (await client.post('/api/account/avatar/upload-target', { contentType: 'image/png', size: fake.length })).json();
    await client.put(target.url, fake, { headers: { 'content-type': 'image/png' } });
    const done = await client.post('/api/account/avatar', { key: target.key });
    expect(done.statusCode).toBe(400);
    expect(done.json().error.message).toBe('Choose a JPEG, PNG, or WebP image.');
  });

  it('rejects oversize and unsupported types before upload', async () => {
    const client = ctx.client();
    await signUpUser(client);
    const big = await client.post('/api/account/avatar/upload-target', { contentType: 'image/png', size: 9 * 1024 * 1024 });
    expect(big.json().error.fields.size).toBe('Choose an image smaller than 8 MB.');
    const gif = await client.post('/api/account/avatar/upload-target', { contentType: 'image/gif', size: 10 });
    expect(gif.json().error.fields.contentType).toBe('Choose a JPEG, PNG, or WebP image.');
  });

  it("refuses to finalize someone else's upload key", async () => {
    const owner = ctx.client();
    await signUpUser(owner);
    const target = (await owner.post('/api/account/avatar/upload-target', { contentType: 'image/png', size: 10 })).json();
    const thief = ctx.client();
    await signUpUser(thief);
    const stolen = await thief.post('/api/account/avatar', { key: target.key });
    expect(stolen.statusCode).toBe(400);
  });
});

describe('export and delete', () => {
  it('exports account data as a JSON attachment', async () => {
    const client = ctx.client();
    const { email } = await signUpUser(client);
    const response = await client.get('/api/account/export');
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-disposition']).toMatch(/attachment; filename="kinfolk-export-/);
    expect(response.json().account.email).toBe(email);
  });

  it('requires the exact email to delete, then destroys the account and its sessions', async () => {
    const client = ctx.client();
    const { email, password } = await signUpUser(client);

    const summary = await client.get('/api/account/deletion-summary');
    expect(summary.json()).toMatchObject({ email, ownedTrees: [] });

    const wrong = await client.delete('/api/account', { confirmEmail: 'someone@else.com' });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json().error.fields.confirmEmail).toMatch(/exactly/);

    const deleted = await client.delete('/api/account', { confirmEmail: email });
    expect(deleted.statusCode).toBe(204);
    expect((await client.get('/api/auth/me')).statusCode).toBe(401);
    const login = await ctx.client().post('/api/auth/login', { email, password });
    expect(login.statusCode).toBe(401);
  });
});
