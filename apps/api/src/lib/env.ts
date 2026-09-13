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
    ENABLE_EMAIL_REMINDERS: z
      .string()
      .optional()
      .transform((value) => (value === undefined || value === '' ? 'false' : value))
      .pipe(z.enum(['true', 'false']))
      .transform((value) => value === 'true'),
  })
  .superRefine((env, ctx) => {
    const groups: Array<[boolean, string[]]> = [
      [env.GOOGLE_CLIENT_ID !== undefined, ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']],
      [
        env.S3_ENDPOINT !== undefined,
        ['S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'],
      ],
    ];
    for (const [partlySet, names] of groups) {
      const mustBeSet = env.NODE_ENV === 'production' || partlySet;
      if (!mustBeSet) continue;
      for (const name of names) {
        if (env[name as keyof typeof env] === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [name],
            message:
              env.NODE_ENV === 'production'
                ? 'is required in production'
                : `is required when ${names[0]} is set`,
          });
        }
      }
    }
    if (env.NODE_ENV === 'production') {
      if (env.SMTP_URL === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['SMTP_URL'], message: 'is required in production' });
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
  const result = envSchema.safeParse(source);
  if (result.success) return result.data;
  const problems = result.error.issues.map((issue) => {
    const name = issue.path.join('.') || 'environment';
    const message = issue.code === 'invalid_type' && issue.received === 'undefined' ? 'is required' : issue.message;
    return `${name} ${message}`;
  });
  throw new EnvValidationError([...new Set(problems)]);
}
