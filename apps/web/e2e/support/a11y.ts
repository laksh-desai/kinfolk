import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** Full axe scan in a real browser — including colour contrast, which jsdom can't compute. */
export async function expectAccessible(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
  const violations = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    nodes: violation.nodes.slice(0, 3).map((node) => node.target.join(' ')),
  }));
  expect(violations, `axe violations on ${label}`).toEqual([]);
}

export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'page body scrolls horizontally').toBeLessThanOrEqual(0);
}
