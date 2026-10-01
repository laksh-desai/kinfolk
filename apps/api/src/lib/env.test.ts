import { describe, expect, it } from 'vitest';
import { devAdaptersInUse, EnvValidationError, parseEnv } from './env';

const valid = {
  DATABASE_URL: 'postgres://kinfolk:kinfolk@localhost:5432/kinfolk',
  SESSION_SECRET: 'x'.repeat(32),
};

function problemsFor(source: Record<string, string | undefined>): string[] {
  try {
    parseEnv(source);
  } catch (error) {
    if (error instanceof EnvValidationError) return error.problems;
    throw error;
  }
  return [];
}

describe('parseEnv', () => {
  it('names every missing required variable at once', () => {
    const problems = problemsFor({});
    expect(problems).toContain('DATABASE_URL is required');
    expect(problems).toContain('SESSION_SECRET is required');
  });

  it('treats empty strings from .env.example as missing', () => {
    const problems = problemsFor({ DATABASE_URL: '', SESSION_SECRET: '' });
    expect(problems).toEqual(['DATABASE_URL is required', 'SESSION_SECRET is required']);
  });

  it('puts the variable names in the thrown message', () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL is required[\s\S]*SESSION_SECRET is required/);
  });

  it('applies the documented defaults', () => {
    const env = parseEnv(valid);
    expect(env.API_PORT).toBe(4000);
    expect(env.WEB_URL).toBe('http://localhost:5173');
    expect(env.ACCESS_TOKEN_TTL).toBe(15 * 60_000);
    expect(env.REFRESH_TOKEN_TTL).toBe(30 * 86_400_000);
    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
  });

  it('rejects a short session secret and a malformed duration', () => {
    const problems = problemsFor({ ...valid, SESSION_SECRET: 'short', ACCESS_TOKEN_TTL: 'soon' });
    expect(problems).toContain('SESSION_SECRET must be at least 32 characters');
    expect(problems).toContain('ACCESS_TOKEN_TTL must look like 15m or 30d');
  });

  it('requires S3 and SMTP settings in production, and says how to run a preview instead', () => {
    const problems = problemsFor({ ...valid, NODE_ENV: 'production' });
    const preview = ' is required in production (or set ALLOW_DEV_ADAPTERS=true for a preview deployment)';
    expect(problems).toEqual(
      expect.arrayContaining([`S3_BUCKET${preview}`, `SMTP_URL${preview}`, 'MAIL_FROM is required in production']),
    );
  });

  it('runs production with password sign-in only when Google is not configured', () => {
    const problems = problemsFor({ ...valid, NODE_ENV: 'production' });
    expect(problems.filter((problem) => problem.startsWith('GOOGLE_'))).toEqual([]);
  });

  it('requires the rest of a group once one member is set', () => {
    expect(problemsFor({ ...valid, GOOGLE_CLIENT_ID: 'abc' })).toEqual([
      'GOOGLE_CLIENT_SECRET is required when GOOGLE_CLIENT_ID is set',
    ]);
  });
});

describe('deploying (ADR 036)', () => {
  const production = { ...valid, NODE_ENV: 'production' };

  it('still refuses to ship a development adapter silently', () => {
    const problems = problemsFor(production);
    for (const name of ['S3_ENDPOINT', 'S3_BUCKET', 'SMTP_URL']) {
      expect(problems.some((problem) => problem.startsWith(name)), name).toBe(true);
    }
    expect(problems[0]).toMatch(/ALLOW_DEV_ADAPTERS=true for a preview deployment/);
  });

  it('boots a preview when the deployment says so in as many words, and names what is stood in for', () => {
    const env = parseEnv({ ...production, ALLOW_DEV_ADAPTERS: 'true' });
    expect(env.ALLOW_DEV_ADAPTERS).toBe(true);
    expect(devAdaptersInUse(env)).toEqual([
      expect.stringContaining('object storage'),
      expect.stringContaining('email'),
    ]);
  });

  it('says nothing is stood in for once the real services are configured', () => {
    const env = parseEnv({
      ...production,
      ALLOW_DEV_ADAPTERS: 'true',
      S3_ENDPOINT: 'https://example.r2.cloudflarestorage.com',
      S3_REGION: 'auto',
      S3_BUCKET: 'kinfolk',
      S3_ACCESS_KEY_ID: 'key',
      S3_SECRET_ACCESS_KEY: 'secret',
      SMTP_URL: 'smtp://user:pass@smtp.example.com:587',
      MAIL_FROM: 'Kinfolk <no-reply@example.com>',
    });
    expect(devAdaptersInUse(env)).toEqual([]);
  });

  it('takes the port a platform hands it, and prefers an explicit API_PORT', () => {
    expect(parseEnv({ ...valid, PORT: '8080' }).API_PORT).toBe(8080);
    expect(parseEnv({ ...valid, PORT: '8080', API_PORT: '4000' }).API_PORT).toBe(4000);
    expect(parseEnv(valid).API_PORT).toBe(4000);
  });

  it('reads the sign-up allow-list as addresses and domains, lower-cased', () => {
    expect(parseEnv({ ...valid, SIGNUP_ALLOWLIST: ' Person@ATS.com , @atswealth.com ,, ' }).SIGNUP_ALLOWLIST).toEqual([
      'person@ats.com',
      '@atswealth.com',
    ]);
    expect(parseEnv(valid).SIGNUP_ALLOWLIST).toEqual([]);
  });
});
