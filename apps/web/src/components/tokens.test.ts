/// <reference types="node" />
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(path.resolve(__dirname, '../styles.css'), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no ${selector} block`);
  const body = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/--kf-([a-z-]+):\s*(#[0-9a-f]{6})/gi)].map((match) => [match[1] ?? '', match[2] ?? '']));
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** [foreground, background] pairs actually used for text in the UI. */
const TEXT_PAIRS: Array<[string, string]> = [
  ['ink', 'ground'],
  ['ink', 'surface'],
  ['ink', 'sunken'],
  ['ink', 'canvas'],
  ['ink-muted', 'ground'],
  ['ink-muted', 'surface'],
  ['ink-muted', 'sunken'],
  ['ink-muted', 'canvas'],
  ['ink-faint', 'surface'],
  ['ink-faint', 'ground'],
  ['on-accent', 'accent'],
  ['on-accent', 'accent-hover'],
  ['accent', 'surface'],
  ['accent', 'ground'],
  ['accent', 'accent-soft'],
  ['danger', 'surface'],
  ['danger', 'danger-soft'],
  ['on-danger', 'danger'],
  ['warning', 'warning-soft'],
  ['warning', 'surface'],
  ['success', 'success-soft'],
  ['success', 'surface'],
  ['info', 'info-soft'],
  ['info', 'surface'],
  ['ground', 'ink'],
  ['ink', 'branch-tint'],
  ['male', 'male-soft'],
  ['male', 'surface'],
  ['female', 'female-soft'],
  ['female', 'surface'],
];

/** Non-text UI (control borders, canvas edges, focus rings) needs 3:1 (WCAG 1.4.11). */
const UI_PAIRS: Array<[string, string]> = [
  ['border-strong', 'surface'],
  ['border-strong', 'ground'],
  ['edge', 'canvas'],
  ['focus', 'surface'],
  ['focus', 'ground'],
];

describe.each([
  ['light', ':root'],
  ['dark', ":root[data-theme='dark']"],
])('%s theme tokens', (_name, selector) => {
  const tokens = block(selector);

  it.each(TEXT_PAIRS)('%s on %s meets 4.5:1', (fg, bg) => {
    expect(tokens[fg], fg).toBeDefined();
    expect(tokens[bg], bg).toBeDefined();
    expect(contrast(tokens[fg] ?? '', tokens[bg] ?? '')).toBeGreaterThanOrEqual(4.5);
  });

  it.each(UI_PAIRS)('%s on %s meets 3:1', (fg, bg) => {
    expect(contrast(tokens[fg] ?? '', tokens[bg] ?? '')).toBeGreaterThanOrEqual(3);
  });
});
