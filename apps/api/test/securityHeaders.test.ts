import { afterAll, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from './testApp';

const contexts: TestContext[] = [];

afterAll(async () => {
  await Promise.all(contexts.map((context) => context.close()));
});

async function cspFor(envOverrides: Record<string, string> = {}): Promise<string> {
  const context = await createTestContext({ envOverrides });
  contexts.push(context);
  const response = await context.client().get('/api/health');
  return String(response.headers['content-security-policy'] ?? '');
}

describe('content security policy', () => {
  it('allows no third-party script by default — address entry is plain text (SPEC §6.23)', async () => {
    const csp = await cspFor();
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain('googleapis');
  });

  it('allows Google Places only when a Places key is configured', async () => {
    const csp = await cspFor({ VITE_GOOGLE_PLACES_KEY: 'test-places-key' });
    expect(csp).toMatch(/script-src 'self' https:\/\/maps\.googleapis\.com/);
    expect(csp).toMatch(/connect-src 'self' https:\/\/maps\.googleapis\.com/);
    expect(csp).toMatch(/img-src [^;]*https:\/\/maps\.gstatic\.com/);
  });
});
