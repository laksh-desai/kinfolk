import { describe, expect, it } from 'vitest';
import { deriveKey, hashPassword, randomOtp, signToken, verifyPassword, verifyToken } from './crypto';

describe('password hashing', () => {
  it('verifies the right password and rejects the wrong one', async () => {
    const stored = await hashPassword('correct horse battery');
    expect(stored.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('correct horse battery', stored)).toBe(true);
    expect(await verifyPassword('correct horse batterx', stored)).toBe(false);
  });

  it('salts every hash', async () => {
    expect(await hashPassword('same password')).not.toBe(await hashPassword('same password'));
  });

  it('rejects a malformed stored hash instead of throwing', async () => {
    expect(await verifyPassword('anything', 'bcrypt$nope')).toBe(false);
  });
});

describe('signed tokens', () => {
  const key = deriveKey('s'.repeat(32), 'test');

  it('round-trips a payload', () => {
    const token = signToken(key, { sub: 'u1', exp: Date.now() + 1000 });
    expect(verifyToken<{ sub: string; exp: number }>(key, token)?.sub).toBe('u1');
  });

  it('rejects expired, tampered, and cross-purpose tokens', () => {
    const expired = signToken(key, { sub: 'u1', exp: Date.now() - 1 });
    expect(verifyToken(key, expired)).toBeNull();

    const token = signToken(key, { sub: 'u1', exp: Date.now() + 1000 });
    const [body, signature] = token.split('.');
    const forgedBody = Buffer.from(JSON.stringify({ sub: 'admin', exp: Date.now() + 1000 })).toString('base64url');
    expect(verifyToken(key, `${forgedBody}.${signature}`)).toBeNull();
    expect(verifyToken(key, `${body}.${signature}.extra`)).toBeNull();

    const otherKey = deriveKey('s'.repeat(32), 'other');
    expect(verifyToken(otherKey, token)).toBeNull();
  });
});

describe('randomOtp', () => {
  it('is always six digits', () => {
    for (let i = 0; i < 200; i += 1) expect(randomOtp()).toMatch(/^\d{6}$/);
  });
});
