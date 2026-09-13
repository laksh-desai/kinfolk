import axe from 'axe-core';
import { expect } from 'vitest';

/**
 * Runs axe against rendered DOM. Colour contrast can't be computed in jsdom, so it is checked
 * separately from the design tokens in components/tokens.test.ts.
 */
export async function expectNoAxeViolations(
  container: Element = document.body,
  options: { isolatedComponent?: boolean } = {},
): Promise<void> {
  const results = await axe.run(container, {
    rules: {
      'color-contrast': { enabled: false },
      // Landmark rules only make sense for a whole page, not a component rendered alone.
      region: { enabled: !options.isolatedComponent },
    },
  });
  const summary = results.violations.map((violation) => ({
    id: violation.id,
    help: violation.help,
    nodes: violation.nodes.map((node) => node.html),
  }));
  expect(summary).toEqual([]);
}
