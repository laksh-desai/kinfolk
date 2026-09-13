/**
 * Strips anything from a URL that could identify a person or grant access: query strings
 * are dropped entirely and token path segments are masked.
 */
export function redactUrl(url: string): string {
  const [pathOnly = ''] = url.split('?');
  return pathOnly
    .replace(/^(\/api\/(?:shared|review|invitations|uploads))\/[^/]+/, '$1/[token]')
    .replace(/^\/(s|review|invite)\/[^/]+/, '/$1/[token]');
}
