import { vi } from 'vitest';

export interface MockRequest {
  method: string;
  path: string;
  search: URLSearchParams;
  body: unknown;
  headers: Record<string, string>;
}

export interface MockResponse {
  status?: number;
  body?: unknown;
}

export type MockHandler = (request: MockRequest) => MockResponse | Promise<MockResponse>;

export interface MockApi {
  calls: MockRequest[];
  set: (key: string, handler: MockHandler) => void;
}

/**
 * Replaces fetch with a route table keyed by "METHOD /path". Unknown routes return 404 so a
 * test fails loudly instead of hanging.
 */
export function mockApi(routes: Record<string, MockHandler>): MockApi {
  const table = new Map(Object.entries(routes));
  const calls: MockRequest[] = [];
  document.cookie = 'kf_csrf=test-csrf';
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://localhost');
    const method = (init.method ?? 'GET').toUpperCase();
    let body: unknown = undefined;
    if (typeof init.body === 'string') {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    const request: MockRequest = {
      method,
      path: url.pathname,
      search: url.searchParams,
      body,
      headers: Object.fromEntries(Object.entries((init.headers as Record<string, string> | undefined) ?? {})),
    };
    calls.push(request);
    const handler = table.get(`${method} ${url.pathname}`);
    const result = handler ? await handler(request) : { status: 404, body: { error: { code: 'not_found', message: 'Not found' } } };
    const status = result.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(result.body ?? {}), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  });
  return { calls, set: (key, handler) => table.set(key, handler) };
}

export const testUser = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'asha@example.com',
  firstName: 'Asha',
  lastName: 'Rao',
  avatarUrl: null,
  hasPassword: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

export const signedOut: MockHandler = () => ({
  status: 401,
  body: { error: { code: 'unauthorized', message: 'Your session has ended. Please sign in again.' } },
});
