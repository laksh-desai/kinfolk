import { describe, expect, it } from 'vitest';
import { redactUrl } from './logging';

describe('redactUrl', () => {
  it('drops query strings, which can carry emails and OAuth codes', () => {
    expect(redactUrl('/api/auth/oauth/google/callback?code=secret&state=x')).toBe('/api/auth/oauth/google/callback');
  });

  it('masks token path segments', () => {
    expect(redactUrl('/api/shared/abc.def/graph')).toBe('/api/shared/[token]/graph');
    expect(redactUrl('/api/review/tok123')).toBe('/api/review/[token]');
    expect(redactUrl('/api/uploads/grant.sig')).toBe('/api/uploads/[token]');
    expect(redactUrl('/s/abc')).toBe('/s/[token]');
  });

  it('leaves ordinary paths alone', () => {
    expect(redactUrl('/api/trees/1b2c/graph')).toBe('/api/trees/1b2c/graph');
  });
});
