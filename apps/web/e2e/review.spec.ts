import { expect, test } from '@playwright/test';
import { expectAccessible } from './support/a11y';
import { waitForMail } from './support/outbox';
import { createSeededTree, signUp } from './support/seedTree';

test('submit for review → reviewer requests changes → owner resolves and resubmits → reviewer approves', async ({ page, browser }) => {
  test.setTimeout(240_000);
  const ownerEmail = await signUp(page, 'Asha');
  const { treeId, seed } = await createSeededTree(page);
  await page.setViewportSize({ width: 1280, height: 900 });

  const reviewerContext = await browser.newContext();
  const reviewerPage = await reviewerContext.newPage();
  const reviewerEmail = await signUp(reviewerPage, 'Nadia');

  // Owner sends it for review.
  await page.goto(`/trees/${treeId}`);
  await page.getByRole('link', { name: 'Send for review' }).click();
  const dialog = page.getByRole('dialog', { name: 'Send “Sharma family” for review' });
  await dialog.getByRole('textbox', { name: 'Reviewer’s email' }).fill(reviewerEmail);
  await dialog.getByRole('textbox', { name: /Note for your reviewer/ }).fill('Please check the in-law branch.');
  await dialog.getByRole('button', { name: 'Send for review' }).click();

  const banner = page.getByRole('region', { name: 'Review status' });
  await expect(banner).toContainText('Editing is paused');
  await expect(page.getByText('Status: In review')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Add person' })).toHaveCount(0);
  await expectAccessible(page, 'tree in review');

  // The reviewer opens their link, sees the full record, and asks for changes.
  const mail = await waitForMail(reviewerEmail, /asked you to review/);
  const reviewLink = /\/review\/[A-Za-z0-9_.-]+/.exec(mail.text)?.[0];
  expect(reviewLink).toBeTruthy();
  await reviewerPage.setViewportSize({ width: 1280, height: 900 });
  await reviewerPage.goto(reviewLink as string);
  await expect(reviewerPage.getByRole('heading', { level: 1, name: 'Sharma family' })).toBeVisible();
  const review = reviewerPage.getByRole('complementary', { name: 'Review' });
  await expect(review).toContainText('Please check the in-law branch.');
  await reviewerPage.getByRole('button', { name: /^Ravi Sharma/ }).click();
  await expect(review).toContainText('ravi.sharma@example.com');
  await expectAccessible(reviewerPage, 'reviewer screen');

  await review.getByRole('button', { name: 'Request changes' }).click();
  await expect(review.getByRole('textbox', { name: 'What needs changing' })).toBeFocused();
  await review.getByRole('textbox', { name: 'What needs changing' }).fill('Mohan’s date of death is missing, and Priya’s parents need addresses.');
  await review.getByRole('button', { name: 'Request changes' }).click();
  await expect(review).toContainText('Notes so far');

  // The owner sees the note on the dashboard and on the tree, then edits, resolves, resubmits.
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Waiting for you' })).toContainText('Mohan’s date of death is missing');
  await page.goto(`/trees/${treeId}`);
  await expect(banner).toContainText('asked for changes');
  await expect(page.getByRole('link', { name: 'Add person' })).toBeVisible();

  await page.goto(`/trees/${treeId}/people/${seed!.people.mohan.id}/edit`);
  await page.getByRole('textbox', { name: /^Nickname/ }).fill('Papa');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status').filter({ hasText: /^Saved/ })).toBeVisible();

  await page.goto(`/trees/${treeId}`);
  await banner.getByRole('button', { name: /^Mark the note from/ }).click();
  await banner.getByRole('button', { name: 'Resubmit for review' }).click();
  await expect(page.getByText('Status: In review')).toBeVisible();

  // The reviewer approves.
  await reviewerPage.reload();
  await review.getByRole('button', { name: 'Approve “Sharma family”' }).click();
  await expect(reviewerPage.getByText('Status: Approved')).toBeVisible();
  await page.reload();
  await expect(banner).toContainText('Approved by Nadia Sharma');
  await expect(page.getByText('Status: Approved')).toBeVisible();
  expect(ownerEmail).toBeTruthy();

  // Editing an approved tree returns it to draft.
  await page.getByRole('link', { name: 'Add person' }).click();
  await page.getByRole('textbox', { name: 'First name' }).fill('Bala');
  await page.getByRole('textbox', { name: 'First name' }).press('Enter');
  await expect(page.getByRole('status').filter({ hasText: /^Saved/ })).toBeVisible();
  await expect(page.getByText('Status: Draft')).toBeVisible();
  await reviewerContext.close();
});
