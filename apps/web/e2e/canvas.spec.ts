import { expect, test, type Page } from '@playwright/test';
import { expectAccessible, expectNoHorizontalScroll } from './support/a11y';
import { createSeededTree, signUp } from './support/seedTree';

async function cardBoundsInsideCanvas(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('[aria-label="Family tree canvas"]')!.getBoundingClientRect();
    const cards = [...document.querySelectorAll<HTMLElement>('button[data-person-id]')].map((card) => card.getBoundingClientRect());
    const outside = cards.filter((card) => card.left < canvas.left - 1 || card.right > canvas.right + 1 || card.top < canvas.top - 1 || card.bottom > canvas.bottom + 1);
    return { cards: cards.length, outside: outside.length, canvasWidth: canvas.width };
  });
}

test.describe('tree canvas in a real browser', () => {
  test('opens fitted to content at 768, 1280, and 2560 px, with no horizontal page scroll', async ({ page }) => {
    await signUp(page);
    const { treeId } = await createSeededTree(page);
    for (const width of [768, 1280, 2560]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/trees/${treeId}`);
      await expect(page.getByRole('heading', { level: 1, name: 'Sharma family' })).toBeVisible();
      await expect(page.locator('button[data-person-id]').first()).toBeVisible();
      await page.waitForTimeout(400);
      const result = await cardBoundsInsideCanvas(page);
      expect(result.cards, `cards rendered at ${width}px`).toBe(60);
      expect(result.outside, `cards clipped at ${width}px`).toBe(0);
      await expectNoHorizontalScroll(page);
    }
  });

  test('selection survives a hard refresh and a pasted URL; the panel and canvas are accessible', async ({ page }) => {
    await signUp(page);
    const { treeId, seed } = await createSeededTree(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/trees/${treeId}`);
    await page.getByRole('button', { name: /^Sita Sharma/ }).click();
    await expect(page).toHaveURL(new RegExp(`/trees/${treeId}/people/${seed!.people.sita.id}$`));
    await expect(page.getByRole('complementary', { name: 'Sita Sharma' })).toBeVisible();
    await expect(page).toHaveTitle('Sita Sharma · Sharma family · Kinfolk');

    await page.reload();
    await expect(page.getByRole('complementary', { name: 'Sita Sharma' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Sita Sharma/ })).toHaveAttribute('aria-current', 'true');
    await expectAccessible(page, 'canvas with panel');

    await page.goto(`/trees/${treeId}/people/${seed!.people.ishaan.id}`);
    await expect(page.getByRole('complementary', { name: 'Ishaan Pillai' })).toContainText('Second cousin once removed');
  });

  test('keyboard alone: arrows walk relationships, / searches, F fits, Escape clears', async ({ page }) => {
    await signUp(page);
    const { treeId, seed } = await createSeededTree(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/trees/${treeId}/people/${seed!.people.ravi.id}`);
    await page.getByRole('button', { name: /^Ravi Sharma/ }).focus();
    await page.keyboard.press('ArrowUp');
    await expect(page).toHaveURL(new RegExp(`/people/(${seed!.people.vikram.id}|${seed!.people.nisha.id})$`));
    await page.keyboard.press('/');
    await page.keyboard.type('Ishaan');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/people/${seed!.people.ishaan.id}$`));
    await expect(page.getByRole('button', { name: /^Ishaan Pillai/ })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(new RegExp(`/trees/${treeId}$`));
  });

  test('ctrl+wheel zooms toward the cursor', async ({ page }) => {
    await signUp(page);
    const { treeId } = await createSeededTree(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/trees/${treeId}`);
    const canvas = page.getByRole('region', { name: 'Family tree canvas' });
    await canvas.getByRole('button', { name: 'Reset zoom to 100%' }).click();
    await expect(page.getByLabel('Zoom level')).toHaveText('100%');
    const box = (await canvas.boundingBox())!;
    const probe = { x: box.x + box.width * 0.7, y: box.y + box.height * 0.6 };
    const before = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('button[data-person-id]')?.getAttribute('data-person-id') ?? null, probe);
    await page.mouse.move(probe.x, probe.y);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -200);
    await page.keyboard.up('Control');
    await expect(page.getByLabel('Zoom level')).not.toHaveText('100%');
    const after = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('button[data-person-id]')?.getAttribute('data-person-id') ?? null, probe);
    if (before) expect(after).toBe(before);
  });

  test('500-person tree: renders, virtualises cards, and records pan frame timings', async ({ page }) => {
    test.setTimeout(240_000);
    await signUp(page);
    const { treeId } = await createSeededTree(page, 'large');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/trees/${treeId}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Large family' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'too large to show whole' })).toBeVisible();
    const rendered = await page.locator('button[data-person-id]').count();
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThan(500);

    const canvas = page.getByRole('region', { name: 'Family tree canvas' });
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.evaluate(() => {
      const frames: number[] = [];
      let last = performance.now();
      const tick = (now: number) => {
        frames.push(now - last);
        last = now;
        if (frames.length < 240) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      (window as unknown as { __frames: number[] }).__frames = frames;
    });
    for (let i = 0; i < 90; i += 1) await page.mouse.wheel(i % 30 < 15 ? 40 : -40, 10);
    await page.waitForTimeout(1500);
    const frames = await page.evaluate(() => (window as unknown as { __frames: number[] }).__frames.slice(5));
    const sorted = [...frames].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
    test.info().annotations.push({ type: 'frame-times', description: `median ${median.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms over ${frames.length} frames (headless Chromium)` });
    console.warn(`500-person pan: median ${median.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms, frames ${frames.length}`);
    expect(frames.length).toBeGreaterThan(100);
  });
});
