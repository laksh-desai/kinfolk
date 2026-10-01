// Holds the SPEC §9 budget: the initial route under 200 KB of gzipped JS and CSS, and every
// lazy route (the initial payload plus everything that route pulls in) under it too. Reads the
// chunk graph Vite writes to dist/.vite/manifest.json, so run `pnpm --filter web build` first.
// Exits 1 over budget, which is what makes it a CI step rather than a note in a document.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const BUDGET_BYTES = 200 * 1024;
const report = (line) => process.stdout.write(`${line}\n`);
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const manifestPath = path.join(dist, '.vite/manifest.json');
if (!existsSync(manifestPath)) {
  console.error(`No manifest at ${manifestPath}. Run "pnpm --filter web build" first.`);
  process.exit(2);
}
/** @type {Record<string, { file: string; css?: string[]; imports?: string[]; dynamicImports?: string[]; isEntry?: boolean }>} */
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

const gzipped = new Map();
function gzipBytes(file) {
  if (!gzipped.has(file)) gzipped.set(file, gzipSync(readFileSync(path.join(dist, file))).length);
  return gzipped.get(file);
}

/** Every chunk statically reachable from `key`: what the browser must load before it runs. */
function staticClosure(key, seen = new Set()) {
  const chunk = manifest[key];
  if (!chunk || seen.has(key)) return seen;
  seen.add(key);
  for (const imported of chunk.imports ?? []) staticClosure(imported, seen);
  return seen;
}

function bytesOf(keys) {
  const files = new Set();
  for (const key of keys) {
    files.add(manifest[key].file);
    for (const css of manifest[key].css ?? []) files.add(css);
  }
  let total = 0;
  for (const file of files) total += gzipBytes(file);
  return total;
}

const entry = Object.keys(manifest).find((key) => manifest[key].isEntry);
if (!entry) {
  console.error('The manifest has no entry chunk.');
  process.exit(2);
}
const initial = staticClosure(entry);
const initialBytes = bytesOf(initial);

const routes = new Set();
for (const chunk of Object.values(manifest)) for (const key of chunk.dynamicImports ?? []) routes.add(key);
const measured = [...routes]
  .map((key) => {
    const extra = [...staticClosure(key)].filter((dep) => !initial.has(dep));
    return { key, bytes: initialBytes + bytesOf(extra) };
  })
  .sort((a, b) => b.bytes - a.bytes);

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
report(`initial route (${entry}): ${kb(initialBytes)} gzip`);
for (const route of measured.slice(0, 5)) report(`  ${kb(route.bytes).padStart(9)}  ${route.key}`);

const over = [{ key: entry, bytes: initialBytes }, ...measured].filter((route) => route.bytes > BUDGET_BYTES);
if (over.length) {
  console.error(`Over the ${kb(BUDGET_BYTES)} budget: ${over.map((route) => `${route.key} (${kb(route.bytes)})`).join(', ')}`);
  process.exit(1);
}
report(`Everything is under ${kb(BUDGET_BYTES)}.`);
