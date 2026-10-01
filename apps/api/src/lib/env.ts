import { z } from 'zod';
import { DURATION_PATTERN, parseDuration } from './duration';

/** Empty strings in .env files mean "not set". */
const optionalString = z
  .string()
  .optional()
  .transform((value) => (value === undefined || value.trim() === '' ? undefined : value.trim()));

const requiredString = (hint: string) =>
  z
    .string({ required_error: hint })
    .transform((value) => value.trim())
    .refine((value) => value.length > 0, { message: hint });

const duration = (fallback: string) =>
  z
    .string()
    .optional()
    .transform((value) => (value === undefined || value.trim() === '' ? fallback : value.trim()))
    .refine((value) => DURATION_PATTERN.test(value), { message: 'must look like 15m or 30d' })
    .transform(parseDuration);

const url = (fallback: string) =>
  z
    .string()
    .optional()
    .transform((value) => (value === undefined || value.trim() === '' ? fallback : value.trim()))
    .refine((value) => URL.canParse(value), { message: 'must be an absolute URL' })
    .transform((value) => value.replace(/\/+$/, ''));

const envSchema = z
  .object({
    NODE_ENV: z
      .string()
      .optional()
      .transform((value) => (value === undefined || value === '' ? 'development' : value))
      .pipe(z.enum(['development', 'test', 'production'])),
    DATABASE_URL: requiredString('is required').refine(
      (value) => value === '' || /^postgres(ql)?:\/\//.test(value),
      { message: 'must be a postgres:// connection string' },
    ),
    // Hosts hand the port over as PORT; parseEnv falls back to it before this runs.
    API_PORT: z
      .string()
      .optional()
      .transform((value) => (value === undefined || value === '' ? '4000' : value))
      .pipe(z.coerce.number().int().min(1).max(65535)),
    API_URL: url('http://localhost:4000'),
    WEB_URL: url('http://localhost:5173'),
    SESSION_SECRET: requiredString('is required').refine(
      (value) => value === '' || value.length >= 32,
      { message: 'must be at least 32 characters' },
    ),
    ACCESS_TOKEN_TTL: duration('15m'),
    REFRESH_TOKEN_TTL: duration('30d'),
    GOOGLE_CLIENT_ID: optionalString,
    GOOGLE_CLIENT_SECRET: optionalString,
    VITE_GOOGLE_PLACES_KEY: optionalString,
    S3_ENDPOINT: optionalString,
    S3_REGION: optionalString,
    S3_BUCKET: optionalString,
    S3_ACCESS_KEY_ID: optionalString,
    S3_SECRET_ACCESS_KEY: optionalString,
    LOCAL_STORAGE_DIR: z
      .string()
      .optional()
      .transform((value) => (value === undefined || value === '' ? './var/storage' : value)),
    SMTP_URL: optionalString,
    MAIL_FROM: z
      .string()
      .optional()
      .transform((value) =>
        value === undefined || value.trim() === '' ? 'Kinfolk <no-reply@localhost>' : value.trim(),
      ),
    MAIL_OUTBOX_DIR: z
      .string()
      .optional()
      .transform((value) => (value === undefined || value === '' ? './var/mail' : value)),
    /**
     * Run deployed without Google, S3, or SMTP configured, using the file-backed adapters
     * instead. For a preview a client is looking at, never for the real thing: uploads live on
     * the host's disk and no email is delivered. Boot says so, loudly (ADR 036).
     */
    ALLOW_DEV_ADAPTERS: z
      .string()
      .optional()
      .transform((value) => (value === undefined || value === '' ? 'false' : value))
      .pipe(z.enum(['true', 'false']))
      .transform((value) => value === 'true'),
    /**
     * Guards public records behind a shared passphrase, asked for before a PDF is uploaded or
     * opened (ADR 037). Unset means records are open to every member of the tree, which is what
     * a developer's machine wants. Never a literal in this repository.
     */
    RECORDS_PASSPHRASE: optionalString,
    /**
     * Addresses and @domains that may create an account. Empty means anyone, which is right for
     * the real product and wrong for a preview on a URL that has been sent to a client.
     */
    SIGNUP_ALLOWLIST: z
      .string()
      .optional()
      .transform((value) =>
        (value ?? '')
          .split(',')
          .map((entry) => entry.trim().toLowerCase())
          .filter((entry) => entry.length > 0),
      ),
  })
  .superRefine((env, ctx) => {
    // Google is optional even in production: without it, Google sign-in is off and people sign
    // in with a password (ADR 038). Storage and email have no safe "off", so they stay required.
    const groups: Array<[boolean, boolean, string[]]> = [
      [env.GOOGLE_CLIENT_ID !== undefined, false, ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']],
      [
        env.S3_ENDPOINT !== undefined,
        true,
        ['S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'],
      ],
    ];
    const strict = env.NODE_ENV === 'production' && !env.ALLOW_DEV_ADAPTERS;
    for (const [partlySet, requiredInProduction, names] of groups) {
      const mustBeSet = (strict && requiredInProduction) || partlySet;
      if (!mustBeSet) continue;
      for (const name of names) {
        if (env[name as keyof typeof env] === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [name],
            message: !partlySet
              ?'is required in production (or set ALLOW_DEV_ADAPTERS=true for a preview deployment)'
              : `is required when ${names[0]} is set`,
          });
        }
      }
    }
    if (strict) {
      if (env.SMTP_URL === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SMTP_URL'],
          message: 'is required in production (or set ALLOW_DEV_ADAPTERS=true for a preview deployment)',
        });
      }
      if (env.MAIL_FROM.endsWith('@localhost>')) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['MAIL_FROM'], message: 'is required in production' });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Kinfolk API cannot start. Fix these environment variables:\n  - ${problems.join('\n  - ')}`);
    this.name = 'EnvValidationError';
  }
}

/** Validates the whole environment at once so every problem is reported together, at boot. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  // Platforms assign the port through PORT; API_PORT stays the name the app uses.
  const withPort = source.API_PORT || !source.PORT ? source : { ...source, API_PORT: source.PORT };
  const result = envSchema.safeParse(withPort);
  if (result.success) return result.data;
  const problems = result.error.issues.map((issue) => {
    const name = issue.path.join('.') || 'environment';
    const message = issue.code === 'invalid_type' && issue.received === 'undefined' ? 'is required' : issue.message;
    return `${name} ${message}`;
  });
  throw new EnvValidationError([...new Set(problems)]);
}

/**
 * Which services are the file-backed stand-ins rather than the real thing. Empty in a proper
 * deployment; a deployed preview prints it at boot so nobody mistakes one for the other.
 */
export function devAdaptersInUse(env: Env): string[] {
  const using: string[] = [];
  if (!env.S3_ENDPOINT) using.push('object storage (uploads are on this host’s disk and go when it restarts)');
  if (!env.SMTP_URL) using.push('email (messages are written to a folder, never delivered)');
  return using;
}
