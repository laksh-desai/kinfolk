import { describe, expect, it } from 'vitest';
import { EnvValidationError, parseEnv } from './env';

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
    expect(env.ENABLE_EMAIL_REMINDERS).toBe(false);
    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
  });

  it('rejects a short session secret and a malformed duration', () => {
    const problems = problemsFor({ ...valid, SESSION_SECRET: 'short', ACCESS_TOKEN_TTL: 'soon' });
    expect(problems).toContain('SESSION_SECRET must be at least 32 characters');
    expect(problems).toContain('ACCESS_TOKEN_TTL must look like 15m or 30d');
  });

  it('requires Google, S3 and SMTP settings in production', () => {
    const problems = problemsFor({ ...valid, NODE_ENV: 'production' });
    expect(problems).toEqual(
      expect.arrayContaining([
        'GOOGLE_CLIENT_ID is required in production',
        'GOOGLE_CLIENT_SECRET is required in production',
        'S3_BUCKET is required in production',
        'SMTP_URL is required in production',
        'MAIL_FROM is required in production',
      ]),
    );
  });

  it('requires the rest of a group once one member is set', () => {
    expect(problemsFor({ ...valid, GOOGLE_CLIENT_ID: 'abc' })).toEqual([
      'GOOGLE_CLIENT_SECRET is required when GOOGLE_CLIENT_ID is set',
    ]);
  });
});
