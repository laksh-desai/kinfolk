import { apiErrorSchema } from '@kinfolk/shared/schemas/auth';

export type ApiErrorKind = 'http' | 'offline' | 'network' | 'timeout' | 'unauthorized';

/** Every failed request becomes one of these. `message` is always safe to show a person. */
export class ApiError extends Error {
  constructor(
    public readonly kind: ApiErrorKind,
    message: string,
    public readonly status = 0,
    public readonly code: string = kind,
    public readonly fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Worth retrying automatically: the request may never have reached the server. */
  get isTransient(): boolean {
    return this.kind === 'offline' || this.kind === 'network' || this.kind === 'timeout' || this.status >= 500;
  }
}

export const MESSAGES = {
  offline: "You're offline. Check your internet connection — we'll try again when you're back.",
  network: "We couldn't reach Kinfolk. Check your connection and try again.",
  timeout: 'This is taking longer than it should. Check your connection and try again.',
  unauthorized: 'Your session has ended. Please sign in again.',
  server: 'Something went wrong on our side. Please try again.',
} as const;

/** A message that is always safe and useful to show a person, whatever was thrown. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Something went wrong. Please try again.';
}

const SAFE_METHODS = new Set(['GET', 'HEAD']);
const AUTH_PATHS_WITHOUT_REFRESH = ['/api/auth/login', '/api/auth/signup', '/api/auth/refresh', '/api/auth/logout'];

let unauthorizedHandler: (() => void) | null = null;
/** Called once a refresh-and-retry has failed. The router uses it to send the user to sign in. */
export function onUnauthorized(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

function readCookie(name: string): string | undefined {
  return document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

async function ensureCsrfToken(): Promise<string> {
  const existing = readCookie('kf_csrf');
  if (existing) return existing;
  await fetch('/api/auth/csrf', { credentials: 'same-origin' });
  return readCookie('kf_csrf') ?? '';
}

let refreshInFlight: Promise<boolean> | null = null;
/** Single-flight: ten concurrent 401s cause one refresh, not ten. */
function refreshSession(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const csrf = await ensureCsrfToken();
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'x-csrf-token': csrf, 'content-type': 'application/json' },
        body: '{}',
      });
      return response.ok;
    } catch {
      return false;
    }
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Raw body (e.g. a File) sent as-is with this content type. */
  rawBody?: { data: Blob | ArrayBuffer; contentType: string };
}

async function send(path: string, options: ApiRequestOptions): Promise<Response> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { accept: 'application/json' };
  if (!SAFE_METHODS.has(method)) headers['x-csrf-token'] = await ensureCsrfToken();

  let body: BodyInit | undefined;
  if (options.rawBody) {
    headers['content-type'] = options.rawBody.contentType;
    body = options.rawBody.data;
  } else if (options.body !== undefined || !SAFE_METHODS.has(method)) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(options.body ?? {});
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), options.timeoutMs ?? 20_000);
  const onAbort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener('abort', onAbort);
  try {
    return await fetch(path, { method, headers, body, credentials: 'same-origin', signal: controller.signal });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if (controller.signal.aborted) throw new ApiError('timeout', MESSAGES.timeout);
    if (typeof navigator !== 'undefined' && !navigator.onLine) throw new ApiError('offline', MESSAGES.offline);
    throw new ApiError('network', MESSAGES.network);
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', onAbort);
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    // non-JSON error body (a proxy page, say) — fall through to a generic message
  }
  const result = apiErrorSchema.safeParse(parsed);
  if (result.success) {
    const { code, message, fields } = result.data.error;
    return new ApiError('http', message, response.status, code, fields ?? {});
  }
  return new ApiError('http', response.status >= 500 ? MESSAGES.server : MESSAGES.network, response.status);
}

/**
 * The only way the web app talks to the API. Cookies carry the session; this adds the CSRF
 * header, a timeout, plain-language errors, and exactly one refresh-and-retry on a 401.
 */
export async function api<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  let response = await send(path, options);

  if (response.status === 401 && !AUTH_PATHS_WITHOUT_REFRESH.includes(path)) {
    const refreshed = await refreshSession();
    if (refreshed) response = await send(path, options);
    if (response.status === 401) {
      if (path !== '/api/auth/me') unauthorizedHandler?.();
      throw new ApiError('unauthorized', MESSAGES.unauthorized, 401, 'unauthorized');
    }
  }

  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;
  const type = response.headers.get('content-type') ?? '';
  return (type.includes('application/json') ? await response.json() : await response.text()) as T;
}
