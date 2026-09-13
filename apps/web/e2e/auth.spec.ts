import { expect, test } from '@playwright/test';
import { expectAccessible, expectNoHorizontalScroll } from './support/a11y';
import { waitForMail } from './support/outbox';

const unique = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

test('sign up, survive a hard refresh, sign out, and sign back in', async ({ page, context }) => {
  const email = `e2e.${unique()}@example.com`;
  await page.goto('/account');
  await expect(page).toHaveURL(/\/login\?returnTo=%2Faccount$/);
  await expect(page).toHaveTitle('Sign in · Kinfolk');
  await expectAccessible(page, 'sign in');

  await page.getByRole('link', { name: 'Create an account' }).click();
  await expect(page).toHaveTitle('Create your account · Kinfolk');

  // An empty submit is never silent.
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByLabel('First name')).toBeFocused();
  await expect(page.getByText('Enter your first name.', { exact: true })).toBeVisible();

  await page.getByLabel('First name').fill('Priya');
  await page.getByLabel('Last name').fill('Shah');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('a long enough password');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Account' })).toBeVisible();
  await expect(page).toHaveTitle('Account · Kinfolk');

  const cookies = await context.cookies();
  for (const name of ['kf_at', 'kf_rt']) expect(cookies.find((cookie) => cookie.name === name)?.httpOnly).toBe(true);
  const stored = await page.evaluate(() => JSON.stringify({ ...window.localStorage }) + JSON.stringify({ ...window.sessionStorage }));
  expect(stored).not.toMatch(/kf_|token|session/i);

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Account' })).toBeVisible();
  await expectAccessible(page, 'account');

  await page.getByRole('button', { name: /Account menu for Priya Shah/ }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.goto('/account');
  await expect(page).toHaveURL(/\/login\?returnTo=%2Faccount$/);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('a long enough password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/account$/);
});

test('forgot password: code by email, refresh mid-flow, new password works', async ({ page }) => {
  const email = `reset.${unique()}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('First name').fill('Ravi');
  await page.getByLabel('Last name').fill('Menon');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('the original password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome, Ravi' })).toBeVisible();
  await page.getByRole('button', { name: /Account menu/ }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();

  await page.getByRole('link', { name: 'Forgot your password?' }).click();
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page).toHaveURL(/\/forgot-password\/verify$/);

  // Refresh mid-flow: the step is restored from an httpOnly cookie, not lost.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible();

  const mail = await waitForMail(email, /reset code/);
  const code = /\b(\d{6})\b/.exec(mail.text)?.[1] ?? '';
  await page.getByLabel('Code').fill(code);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/forgot-password\/reset$/);
  await page.getByLabel('New password', { exact: true }).fill('a completely new password');
  await page.getByLabel('Confirm new password', { exact: true }).fill('a completely new password');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome, Ravi' })).toBeVisible();
});

test('development Google sign-in uses the real callback and session path', async ({ page }) => {
  const email = `google.${unique()}@example.com`;
  await page.goto('/login');
  await page.getByRole('link', { name: /Continue with Google/ }).click();
  await expect(page.getByRole('heading', { name: 'Development Google sign-in' })).toBeVisible();
  await page.getByLabel('Google account email').fill(email);
  await page.getByLabel('First name').fill('Mei');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome, Mei' })).toBeVisible();
  await page.goto('/account');
  await expect(page.getByRole('heading', { name: 'Add a password' })).toBeVisible();
});

test('the delete-account dialog fits a 768px window and blocks until the email is typed', async ({ page }) => {
  const email = `dialog.${unique()}@example.com`;
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto('/signup');
  await page.getByLabel('First name').fill('Tomás');
  await page.getByLabel('Last name').fill('Álvarez-Fitzgerald');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('a long enough password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome, Tomás' })).toBeVisible();
  await page.goto('/account');
  await page.getByRole('button', { name: 'Delete account…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete your Kinfolk account?' });
  await expect(dialog).toBeVisible();
  const fits = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const scrollers = [element, ...element.querySelectorAll('*')].filter((node) => node.scrollWidth > node.clientWidth + 1 && getComputedStyle(node).overflowX !== 'visible');
    return { inViewport: rect.left >= 0 && rect.right <= window.innerWidth, horizontalScrollers: scrollers.length };
  });
  expect(fits).toEqual({ inViewport: true, horizontalScrollers: 0 });
  await expectAccessible(page, 'delete account dialog');

  await dialog.getByRole('button', { name: 'Delete my account forever' }).click();
  await expect(dialog.getByRole('alert')).toContainText('exactly to confirm');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/Type your email/).fill(email);
  await dialog.getByRole('button', { name: 'Delete my account forever' }).click();
  await expect(page).toHaveURL(/\/signup$/);
});

test('auth screens fit a 768px window and a phone without horizontal scroll', async ({ page }) => {
  for (const width of [768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/signup');
    await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
    await expectNoHorizontalScroll(page);
  }
});
