import { expect, test, type Page } from '@playwright/test';
import { expectAccessible } from './support/a11y';
import { createEmptyTree, signUp } from './support/seedTree';

const canvas = (page: Page) => page.getByRole('region', { name: 'Family tree canvas' });

/** Selects a person the way a user would: search from the canvas toolbar, then Enter. */
async function select(page: Page, name: string) {
  await canvas(page).getByRole('button', { name: 'Find a person' }).click();
  await page.getByRole('combobox', { name: 'Find a person by name' }).fill(name);
  await page.getByRole('option', { name: new RegExp(`^${name}`) }).first().click();
  await expect(page.getByRole('complementary', { name: new RegExp(`^${name}`) })).toBeVisible();
}

async function waitForSave(page: Page) {
  await expect(page.getByRole('status').filter({ hasText: /^Saved/ })).toBeVisible();
}

interface AddOptions {
  gender?: 'female' | 'male';
  answers?: Array<[question: string, option: string | RegExp]>;
}

/** From a selected person's panel: More relatives → relationship → quick add. */
async function addRelative(page: Page, anchor: string, relation: string, firstName: string, options: AddOptions = {}) {
  await select(page, anchor);
  const panel = page.getByRole('complementary', { name: new RegExp(`^${anchor}`) });
  const primitive = panel.getByRole('link', { name: `Add ${relation.toLowerCase()}`, exact: true });
  if (['Parent', 'Child', 'Sibling', 'Partner'].includes(relation)) {
    await primitive.click();
  } else {
    await panel.getByRole('link', { name: /More relatives/ }).click();
    await page.getByRole('link', { name: new RegExp(`^${relation}`) }).click();
  }
  for (const [question, option] of options.answers ?? []) {
    await page.getByRole('group', { name: question }).getByRole('radio', { name: option }).check();
  }
  await page.getByRole('textbox', { name: 'First name' }).fill(firstName);
  if (options.gender) await page.getByRole('combobox', { name: 'Gender' }).selectOption(options.gender);
  await page.getByRole('textbox', { name: 'First name' }).press('Enter');
  await expect(page.getByRole('complementary', { name: new RegExp(`^${firstName}`) })).toBeVisible();
  await waitForSave(page);
}

async function expectLabel(page: Page, name: string, label: string) {
  await expect(canvas(page).getByRole('button', { name: new RegExp(`^${name}( [A-Z][a-z]+)?, ${label}$`) })).toHaveCount(1);
}

test.describe('building a family outward from one person (SPEC §4, §12)', () => {
  test('adds every extended relative from the canvas, corrects a relationship, undoes and redoes, and it all survives a refresh', async ({ page }) => {
    test.setTimeout(240_000);
    await signUp(page);
    const { treeId } = await createEmptyTree(page, 'Growing family');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/trees/${treeId}`);

    await page.getByRole('link', { name: 'Add the first person' }).click();
    await page.getByRole('textbox', { name: 'First name' }).fill('Ravi');
    await page.getByRole('combobox', { name: 'Gender' }).selectOption('male');
    await page.getByRole('button', { name: 'Add person' }).click();
    await expect(canvas(page).getByRole('button', { name: 'Ravi, Self, focus person' })).toBeVisible();
    await waitForSave(page);

    // Upward, from the topmost person, creating the unnamed parent in between.
    await addRelative(page, 'Ravi', 'Grandparent', 'Hari', { gender: 'male' });
    await expectLabel(page, 'Hari', 'Grandfather');
    await addRelative(page, 'Ravi', 'Great-grandparent', 'Kamal', { gender: 'male' });
    await expectLabel(page, 'Kamal', 'Great-grandfather');

    // Sideways: aunt and uncle, first cousin, second cousin.
    await addRelative(page, 'Ravi', 'Aunt or uncle', 'Anita', { gender: 'female' });
    await expectLabel(page, 'Anita', 'Aunt');
    await addRelative(page, 'Ravi', 'Aunt or uncle', 'Suresh', { gender: 'male' });
    await expectLabel(page, 'Suresh', 'Uncle');
    await addRelative(page, 'Ravi', 'Cousin', 'Lukas', { gender: 'male', answers: [['Whose child are they?', /^Anita/]] });
    await expectLabel(page, 'Lukas', 'First cousin');
    await addRelative(page, 'Anita', 'Cousin', 'Meera', { gender: 'female' });
    await addRelative(page, 'Meera', 'Child', 'Arjun', { gender: 'male' });
    await expectLabel(page, 'Arjun', 'Second cousin');

    // Downward and across: niece, nephew, half-sibling.
    await addRelative(page, 'Ravi', 'Niece or nephew', 'Mia', { gender: 'female' });
    await expectLabel(page, 'Mia', 'Niece');
    await addRelative(page, 'Ravi', 'Niece or nephew', 'Oliver', { gender: 'male' });
    await expectLabel(page, 'Oliver', 'Nephew');
    await addRelative(page, 'Ravi', 'Half-sibling', 'Karan', { gender: 'male' });
    await expectLabel(page, 'Karan', 'Half-brother');

    // Marriage and in-laws: spouse, step-child, parent-in-law, sibling-in-law.
    await addRelative(page, 'Ravi', 'Partner', 'Priya', { gender: 'female', answers: [['What kind of partner?', /^Spouse/]] });
    await expectLabel(page, 'Priya', 'Wife');
    await addRelative(page, 'Ravi', 'Step-child', 'Ethan', { gender: 'male' });
    await expectLabel(page, 'Ethan', 'Step-son');
    await addRelative(page, 'Ravi', 'Parent-in-law', 'Radha', { gender: 'female' });
    await expectLabel(page, 'Radha', 'Mother-in-law');
    await addRelative(page, 'Ravi', 'Sibling-in-law', 'Divya', { gender: 'female' });
    await expectLabel(page, 'Divya', 'Sister-in-law');

    await expectAccessible(page, 'tree after adding relatives');

    // Correct a wrong relationship without deleting anyone: the marriage ended.
    await select(page, 'Ravi');
    await page.getByRole('complementary', { name: /^Ravi/ }).getByRole('link', { name: 'Relationships' }).click();
    await page.getByRole('combobox', { name: 'Status' }).selectOption('divorced');
    await waitForSave(page);
    await expectLabel(page, 'Priya', 'Former wife');
    await expectAccessible(page, 'relationships editor');

    // Undo and redo, with the named buttons and the keyboard.
    await page.getByRole('button', { name: 'Undo: Marked Ravi and Priya as divorced' }).click();
    await expectLabel(page, 'Priya', 'Wife');
    await waitForSave(page);
    await page.locator('body').press('Control+Shift+Z');
    await expectLabel(page, 'Priya', 'Former wife');
    await waitForSave(page);

    // Everything was saved: a hard refresh shows the same family. With the marriage ended,
    // Priya's side is described through the former marriage.
    await page.reload();
    await expect(page.getByRole('heading', { level: 2, name: 'Ravi’s relationships' })).toBeVisible();
    await expectLabel(page, 'Priya', 'Former wife');
    for (const [name, label] of [
      ['Hari', 'Grandfather'],
      ['Kamal', 'Great-grandfather'],
      ['Lukas', 'First cousin'],
      ['Arjun', 'Second cousin'],
      ['Mia', 'Niece'],
      ['Karan', 'Half-brother'],
      ['Ethan', 'Former wife’s son'],
      ['Radha', 'Former mother-in-law'],
      ['Divya', 'Former sister-in-law'],
      ['Oliver', 'Nephew'],
      ['Meera', 'First cousin once removed'],
    ] as const) {
      await expectLabel(page, name, label);
    }
  });

  /** The two bugs reported from first use (ADR 026, ADR 027), in a real browser. */
  test('a spouse added to a parent is the children’s parent, and the top of the tree can be removed', async ({ page }) => {
    test.setTimeout(180_000);
    await signUp(page);
    const { treeId } = await createEmptyTree(page, 'Menon family');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/trees/${treeId}`);

    await page.getByRole('link', { name: 'Add the first person' }).click();
    await page.getByRole('textbox', { name: 'First name' }).fill('Deepa');
    await page.getByRole('combobox', { name: 'Gender' }).selectOption('female');
    await page.getByRole('button', { name: 'Add person' }).click();
    await waitForSave(page);

    // A father, then a grandfather above him: the tree grows upward one person at a time.
    await addRelative(page, 'Deepa', 'Parent', 'Bala', { gender: 'male' });
    await expectLabel(page, 'Bala', 'Father');
    await addRelative(page, 'Bala', 'Parent', 'Hari', { gender: 'male' });
    await expectLabel(page, 'Hari', 'Paternal grandfather');

    // Bala's spouse, added after his child, is Deepa's mother — not her step-mother.
    await addRelative(page, 'Bala', 'Partner', 'Uma', {
      gender: 'female',
      answers: [['Is this person also a parent of Deepa?', /^Yes/]],
    });
    await expectLabel(page, 'Uma', 'Mother');

    // The person at the top can be removed on his own; everyone below stays.
    await select(page, 'Hari');
    await page.getByRole('complementary', { name: /^Hari/ }).getByRole('button', { name: 'Delete' }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete Hari?' });
    await dialog.getByRole('radio', { name: 'Remove Hari' }).check();
    await expect(dialog).toContainText('Bala will have no parent in the tree');
    await dialog.getByRole('button', { name: 'Delete Hari' }).click();
    await waitForSave(page);

    await page.reload();
    await expect(canvas(page).getByRole('button', { name: /^Hari/ })).toHaveCount(0);
    await expectLabel(page, 'Uma', 'Mother');
    await expectLabel(page, 'Bala', 'Father');
  });
});
