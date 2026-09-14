import { expect, test } from '@playwright/test';
import { expectAccessible, expectNoHorizontalScroll } from './support/a11y';
import { signUp } from './support/seedTree';

test('dashboard → new tree → first person → list view → rename → delete by typing the name', async ({ page }) => {
  test.setTimeout(180_000);
  await signUp(page, 'Asha');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Start your first family tree' })).toBeVisible();
  await expectAccessible(page, 'empty dashboard');
  await page.getByRole('button', { name: 'New family tree' }).click();
  const dialog = page.getByRole('dialog', { name: 'New family tree' });
  await dialog.getByRole('button', { name: 'Create tree' }).click();
  await expect(dialog.getByRole('textbox', { name: 'Tree name' })).toBeFocused();
  await dialog.getByRole('textbox', { name: 'Tree name' }).fill('Osei family');
  await dialog.getByRole('button', { name: 'Create tree' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Osei family' })).toBeVisible();
  await page.getByRole('link', { name: 'Add the first person' }).click();
  await page.getByRole('textbox', { name: 'First name' }).fill('Samuel');
  await page.getByRole('textbox', { name: 'First name' }).press('Enter');
  await expect(page.getByRole('status').filter({ hasText: /^Saved/ })).toBeVisible();

  await page.getByRole('link', { name: 'List', exact: true }).click();
  const list = page.getByRole('region', { name: 'Family tree list' });
  await expect(list.getByRole('link', { name: 'Edit Samuel' })).toBeVisible();
  await expectAccessible(page, 'list view');
  await page.reload();
  await expect(page.getByRole('region', { name: 'Family tree list' })).toBeVisible();

  // Rename opens on the first click (§6.3).
  await page.getByRole('button', { name: 'Rename tree' }).click();
  await expect(page.getByRole('textbox', { name: 'Tree name' })).toBeFocused();
  await page.getByRole('textbox', { name: 'Tree name' }).fill('Osei–Mensah family');
  await page.getByRole('textbox', { name: 'Tree name' }).press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Osei–Mensah family' })).toBeVisible();
  await expect(page).toHaveTitle("Samuel · Osei–Mensah family · Kinfolk");

  await page.goto('/');
  const card = page.getByRole('region', { name: 'Your trees' }).getByRole('listitem');
  await expect(card).toContainText('Osei–Mensah family');
  await expect(card).toContainText('1 person');
  await expectAccessible(page, 'dashboard with a tree');
  await card.getByRole('link', { name: 'Osei–Mensah family' }).click();

  await page.setViewportSize({ width: 768, height: 900 });
  await page.getByRole('button', { name: 'Settings for Osei–Mensah family' }).click();
  await page.getByRole('menuitem', { name: 'Delete this tree…' }).click();
  const confirm = page.getByRole('dialog', { name: 'Delete Osei–Mensah family?' });
  await expect(confirm).toContainText('1 person');
  await expectNoHorizontalScroll(page);
  await confirm.getByRole('button', { name: 'Delete this tree' }).click();
  await expect(confirm.getByText('Type “Osei–Mensah family” exactly to confirm.')).toBeVisible();
  await confirm.getByRole('textbox', { name: 'Type “Osei–Mensah family” to confirm' }).fill('Osei–Mensah family');
  await confirm.getByRole('button', { name: 'Delete this tree' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Start your first family tree' })).toBeVisible();
});
