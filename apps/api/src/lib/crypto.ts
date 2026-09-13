import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const SCRYPT_KEYLEN = 64;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, SCRYPT_KEYLEN, SCRYPT_PARAMS, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

/** Format: scrypt$N$r$p$salt$hash (base64url). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt);
  const { N, r, p } = SCRYPT_PARAMS;
  return ['scrypt', N, r, p, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[4] ?? '', 'base64url');
  const expected = Buffer.from(parts[5] ?? '', 'base64url');
  const actual = await scryptAsync(password, salt);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Separate keys per purpose so a token minted for one use can never be replayed as another. */
export function deriveKey(secret: string, purpose: string): Buffer {
  return createHmac('sha256', secret).update(`kinfolk:${purpose}`).digest();
}

function sign(key: Buffer, data: string): string {
  return createHmac('sha256', key).update(data).digest('base64url');
}

export interface SignedPayload {
  exp: number;
}

/** Compact signed token: base64url(json).signature. Not encrypted — never put secrets inside. */
export function signToken<T extends SignedPayload>(key: Buffer, payload: T): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(key, body)}`;
}

/** Returns null for a malformed, forged, or expired token. */
export function verifyToken<T extends SignedPayload>(key: Buffer, token: string, now = Date.now()): T | null {
  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra !== undefined) return null;
  if (!safeEqual(sign(key, body), signature)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
    if (typeof payload.exp !== 'number' || payload.exp <= now) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Six-digit numeric one-time code, uniformly distributed. */
export function randomOtp(): string {
  const value = randomBytes(4).readUInt32BE(0) % 1_000_000;
  return value.toString().padStart(6, '0');
}
