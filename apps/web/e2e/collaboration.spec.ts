import { expect, test, type Page } from '@playwright/test';
import { expectAccessible, expectNoHorizontalScroll } from './support/a11y';
import { waitForMail } from './support/outbox';
import { createEmptyTree, createSeededTree, signUp } from './support/seedTree';

/** Every control in a dialog must be fully inside the window, with nothing scrolling sideways (SPEC §6.5). */
async function expectDialogFits(page: Page, name: string) {
  const dialog = page.getByRole('dialog', { name });
  await expect(dialog).toBeVisible();
  const problems = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const scrollers = [element, ...element.querySelectorAll('*')].filter((node) => node.scrollWidth > node.clientWidth + 1 && getComputedStyle(node).overflowX !== 'visible');
    const clipped = [...element.querySelectorAll('select, input, button')].filter((node) => {
      const box = node.getBoundingClientRect();
      return box.right > window.innerWidth + 1 || box.left < -1;
    });
    return { inViewport: rect.left >= -1 && rect.right <= window.innerWidth + 1, scrollers: scrollers.length, clipped: clipped.map((node) => node.outerHTML.slice(0, 80)) };
  });
  expect(problems.inViewport, 'dialog inside the viewport').toBe(true);
  expect(problems.scrollers, 'elements scrolling sideways inside the dialog').toBe(0);
  expect(problems.clipped, 'controls clipped off the edge').toEqual([]);
  await expectNoHorizontalScroll(page);
}

test('owner shares a tree: invites an editor who accepts, and a share link shows only redacted detail', async ({ page, browser }) => {
  test.setTimeout(180_000);
  await signUp(page, 'Asha');
  const { treeId } = await createSeededTree(page);
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto(`/trees/${treeId}`);

  await page.getByRole('link', { name: 'Share', exact: true }).click();
  await expectDialogFits(page, 'Share “Sharma family”');
  await expectAccessible(page, 'share dialog');

  const editorContext = await browser.newContext();
  const editorPage = await editorContext.newPage();
  const editorEmail = await signUp(editorPage, 'Kiran');

  const dialog = page.getByRole('dialog', { name: 'Share “Sharma family”' });
  await dialog.getByRole('textbox', { name: 'Email' }).fill(editorEmail);
  await dialog.getByRole('combobox', { name: 'Role' }).selectOption('editor');
  await dialog.getByRole('button', { name: 'Send invitation' }).click();
  await expect(dialog.getByRole('list', { name: 'People with access' })).toContainText(editorEmail);
  await waitForMail(editorEmail, /shared “Sharma family” with you/);

  // The invitee accepts from their dashboard and can then edit.
  await editorPage.goto('/');
  const waiting = editorPage.getByRole('region', { name: 'Waiting for you' });
  await expect(waiting).toContainText('invited you to help edit “Sharma family”');
  await waiting.getByRole('button', { name: 'Accept' }).click();
  await editorPage.getByRole('link', { name: 'Sharma family' }).click();
  await expect(editorPage.getByRole('link', { name: 'Add person' })).toBeVisible();
  await expect(editorPage.getByRole('button', { name: 'Rename tree' })).toHaveCount(0);

  // A share link works signed out, and carries nothing beyond names, relationships, and birth years.
  await page.getByRole('combobox', { name: 'Link works for' }).selectOption('30');
  await page.getByRole('button', { name: 'Create link' }).click();
  const url = await page.getByRole('textbox', { name: /copy it now/i }).inputValue();
  expect(url).toContain('/s/');

  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  await visitor.goto(url);
  await expect(visitor.getByRole('heading', { level: 1, name: 'Sharma family' })).toBeVisible();
  await expect(visitor.getByText('Shared view · read-only')).toBeVisible();
  await visitor.getByRole('button', { name: /^Ravi Sharma/ }).click();
  const panel = visitor.getByRole('complementary', { name: 'Ravi Sharma' });
  await expect(panel).toContainText('b. 1988');
  const body = await visitor.locator('body').innerText();
  for (const secret of ['ravi.sharma@example.com', '415 555 0142', 'Alder Street', 'Architect']) expect(body).not.toContain(secret);
  await expect(visitor.getByRole('link', { name: 'Add person' })).toHaveCount(0);
  await expectAccessible(visitor, 'shared tree view');

  // Turning the link off stops it working, with an explanation.
  await page.getByRole('button', { name: /^Turn off the link created/ }).click();
  await page.getByRole('dialog', { name: 'Turn off this link?' }).getByRole('button', { name: 'Turn off link' }).click();
  await visitor.goto(url);
  await expect(visitor.getByRole('heading', { name: 'This share link no longer works' })).toBeVisible();
  await editorContext.close();
  await visitorContext.close();
});

test('a relative is invited, builds their own tree, and the owner links it', async ({ page, browser }) => {
  test.setTimeout(180_000);
  await signUp(page, 'Asha');
  const { treeId, seed } = await createSeededTree(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/trees/${treeId}/people/${seed!.people.kiran.id}/invite`);

  const relativeContext = await browser.newContext();
  const relativePage = await relativeContext.newPage();
  const relativeEmail = await signUp(relativePage, 'Kiran');

  await page.getByRole('textbox', { name: 'Their email' }).fill(relativeEmail);
  await page.getByRole('button', { name: 'Send invitation' }).click();
  await expect(page.getByRole('list', { name: 'Invitation progress' })).toContainText('Invite sent');
  const mail = await waitForMail(relativeEmail, /invited you to build your family tree/);
  const inviteLink = /\/invite\/[A-Za-z0-9_.-]+/.exec(mail.text)?.[0];
  expect(inviteLink).toBeTruthy();

  await relativePage.goto(inviteLink as string);
  await expect(relativePage.getByRole('heading', { name: /invited you to Kinfolk$/ })).toBeVisible();
  await relativePage.getByRole('button', { name: 'Accept invitation' }).click();
  await expect(relativePage).toHaveURL(/\/$/);
  await expect(page.getByRole('list', { name: 'Invitation progress' })).toContainText('Joined', { timeout: 15_000 });

  // They build their own tree, then ask to link it.
  await createEmptyTree(relativePage, 'Rao family');
  await relativePage.goto('/');
  const waiting = relativePage.getByRole('region', { name: 'Waiting for you' });
  await expect(waiting).toContainText('added you as Kiran Rao');
  await waiting.getByRole('combobox', { name: 'Your tree to link' }).selectOption({ label: 'Rao family' });
  await waiting.getByRole('button', { name: 'Ask to link' }).click();
  await expect(waiting).toContainText('Waiting for');

  // The owner reviews and approves it from their dashboard.
  await page.goto('/');
  await page.getByRole('region', { name: 'Waiting for you' }).getByRole('link', { name: 'Review' }).click();
  const requests = page.getByRole('dialog', { name: 'Link requests' });
  await expect(requests).toContainText('wants to link Rao family to Kiran Rao');
  await expectDialogFits(page, 'Link requests');
  await requests.getByRole('button', { name: 'Approve' }).click();
  await expect(requests).toContainText('Approved');
  await page.getByRole('button', { name: 'Close' }).click();

  await page.goto(`/trees/${treeId}/people/${seed!.people.kiran.id}`);
  const panel = page.getByRole('complementary', { name: 'Kiran Rao' });
  await expect(panel.getByRole('heading', { name: 'Linked family tree' })).toBeVisible();
  await panel.getByRole('link', { name: 'Open Rao family' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Rao family' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to Sharma family' }).click();
  await expect(page.getByRole('complementary', { name: 'Kiran Rao' })).toBeVisible();

  await page.goto(`/trees/${treeId}/people/${seed!.people.kiran.id}/invite`);
  await expect(page.getByRole('list', { name: 'Invitation progress' })).toContainText('Linked');
  await relativeContext.close();
});
