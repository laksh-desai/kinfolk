import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, signedOut, testUser } from '../test/mockApi';
import { api, ApiError, onUnauthorized } from './api';

afterEach(() => onUnauthorized(null));

describe('api', () => {
  it('refreshes once on a 401 and retries the original request', async () => {
    let meCalls = 0;
    const mock = mockApi({
      'GET /api/trees': () => {
        meCalls += 1;
        return meCalls === 1 ? signedOut({} as never) : { body: { trees: [] } };
      },
      'POST /api/auth/refresh': () => ({ body: { user: testUser } }),
    });
    await expect(api('/api/trees')).resolves.toEqual({ trees: [] });
    expect(mock.calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      'GET /api/trees',
      'POST /api/auth/refresh',
      'GET /api/trees',
    ]);
  });

  it('shares one refresh between concurrent 401s and signals sign-out when it fails', async () => {
    const handler = vi.fn();
    onUnauthorized(handler);
    const mock = mockApi({ 'GET /api/a': signedOut, 'GET /api/b': signedOut, 'POST /api/auth/refresh': signedOut });
    const results = await Promise.allSettled([api('/api/a'), api('/api/b')]);
    expect(results.every((result) => result.status === 'rejected' && (result.reason as ApiError).kind === 'unauthorized')).toBe(true);
    expect(mock.calls.filter((call) => call.path === '/api/auth/refresh')).toHaveLength(1);
    expect(handler).toHaveBeenCalled();
  });

  it('turns a failed fetch while offline into a plain offline error', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const error = (await api('/api/trees').catch((caught: unknown) => caught)) as ApiError;
    online.mockRestore();
    expect(error.kind).toBe('offline');
    expect(error.message).toMatch(/offline/);
    expect(error.isTransient).toBe(true);
  });

  it('times out instead of hanging forever', async () => {
    vi.stubGlobal(
      'fetch',
      (_input: unknown, init: RequestInit) =>
        new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
    );
    const error = (await api('/api/slow', { timeoutMs: 20 }).catch((caught: unknown) => caught)) as ApiError;
    expect(error.kind).toBe('timeout');
  });

  it('never surfaces a raw status code for an unexpected server error', async () => {
    vi.stubGlobal('fetch', async () => new Response('<html>Bad gateway</html>', { status: 502 }));
    const error = (await api('/api/trees').catch((caught: unknown) => caught)) as ApiError;
    expect(error.message).toBe('Something went wrong on our side. Please try again.');
    expect(error.message).not.toMatch(/502/);
  });

  it('sends the CSRF header on state-changing requests only', async () => {
    const mock = mockApi({ 'GET /api/x': () => ({ body: {} }), 'POST /api/x': () => ({ body: {} }) });
    await api('/api/x');
    await api('/api/x', { method: 'POST', body: { a: 1 } });
    expect(mock.calls[0]?.headers['x-csrf-token']).toBeUndefined();
    expect(mock.calls[1]?.headers['x-csrf-token']).toBe('test-csrf');
  });
});
