/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '../../../..');

function files(dir: string, extensions: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (name === 'node_modules' || name === 'dist' || name === 'var') return [];
    if (statSync(full).isDirectory()) return files(full, extensions);
    return extensions.test(name) ? [full] : [];
  });
}

const sourceFiles = [
  ...files(path.join(repoRoot, 'apps/web/src'), /\.(tsx?|css|html)$/),
  ...files(path.join(repoRoot, 'apps/api/src'), /\.ts$/),
  ...files(path.join(repoRoot, 'packages/shared/src'), /\.ts$/),
].filter((file) => !/\.test\.tsx?$/.test(file) && !file.includes(`${path.sep}test${path.sep}`));

function offenders(pattern: RegExp): string[] {
  return sourceFiles
    .filter((file) => pattern.test(readFileSync(file, 'utf8')))
    .map((file) => path.relative(repoRoot, file));
}

describe('repository guards (SPEC §6)', () => {
  it('ships no base64 raster images (§6.20)', () => {
    expect(offenders(/data:image\/(png|jpe?g|gif);base64/i)).toEqual([]);
  });

  it('has no bare "Loading…" copy (§6.21)', () => {
    expect(offenders(/>\s*Loading(…|\.\.\.)?\s*</)).toEqual([]);
    expect(offenders(/['"`]Loading(…|\.\.\.)['"`]/)).toEqual([]);
  });

  it('has no "coming soon" items (§6.14)', () => {
    expect(offenders(/coming soon/i)).toEqual([]);
  });

  it('contains no AI assistant or AI provider SDK (hard rule)', () => {
    const manifests = ['package.json', 'apps/web/package.json', 'apps/api/package.json', 'packages/shared/package.json'];
    for (const manifest of manifests) {
      const text = readFileSync(path.join(repoRoot, manifest), 'utf8');
      expect(text, manifest).not.toMatch(/openai|anthropic|@ai-sdk|langchain|@google\/generative-ai|cohere|mistral/i);
    }
    expect(offenders(/from ['"](openai|@anthropic-ai|ai|@ai-sdk\/[^'"]+|langchain)['"]/)).toEqual([]);
  });

  it('keeps browser storage inside lib/preferences.ts (§6.19)', () => {
    const hits = offenders(/\b(localStorage|sessionStorage)\b/).filter((file) => !file.endsWith(path.join('lib', 'preferences.ts')));
    expect(hits).toEqual([]);
  });
});
