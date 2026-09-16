import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Serves the built web app in production, so `pnpm build && pnpm start` runs the whole product
 * from one process (SPEC §9). Hashed assets under `assets/` are immutable and cached for a year;
 * everything else is uncached, because a deploy must not leave a browser holding an old
 * index.html asking for chunks that no longer exist.
 *
 * Returns index.html, which the app's single not-found handler sends for any screen someone
 * pastes or refreshes — every screen is a real URL (SPEC §6.1).
 */
export async function webRoutes(app: FastifyInstance, opts: { root: string }): Promise<string> {
  const index = path.join(opts.root, 'index.html');
  if (!existsSync(index)) throw new Error(`No web build at ${opts.root}. Run "pnpm build" first.`);

  await app.register(fastifyStatic, {
    root: opts.root,
    index: false,
    // Missing names fall through to the not-found handler, which serves the app.
    wildcard: false,
    // Off, or the plugin's own `max-age=0` would win over the header set below.
    cacheControl: false,
    setHeaders: (response, filePath) => {
      const hashed = path.basename(path.dirname(filePath)) === 'assets';
      response.setHeader('cache-control', hashed ? 'public, max-age=31536000, immutable' : 'no-store');
    },
  });

  return readFileSync(index, 'utf8');
}
