import { test, expect, type Page } from '@playwright/test';

async function signInAsAdmin(page: Page) {
  await page.goto('/#/login');
  await page.getByRole('tab', { name: 'Email code' }).click();
  await page.getByRole('textbox', { name: 'Email' }).fill('admin@example.edu');
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('6-digit code').fill('123456');
  await page.getByRole('button', { name: 'Verify code' }).click();
  await expect(page.getByText('admin@example.edu')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto('/#/admin');
  await page.getByRole('link', { name: /^Transfers/ }).click();
  await expect(page.getByRole('heading', { name: 'Group transfers' })).toBeVisible();
});

test('approve a single request and see the open count drop', async ({ page }) => {
  await expect(page.getByRole('link', { name: 'Transfers (3)' })).toBeVisible();
  const card = page.getByRole('article', { name: 'Request from Test003 Student' });
  await card.getByRole('button', { name: /^Approve → Group/ }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('group', { name: /Before and after/ })).toBeVisible();
  await dialog.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Open 2' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Transfers (2)' })).toBeVisible();
});

test('approve the swap pair', async ({ page }) => {
  const pair = page.getByRole('article', { name: /^Swap / });
  await expect(pair.getByText('Sizes unchanged')).toBeVisible();
  await pair.getByRole('button', { name: 'Approve both' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Approve both' }).click();
  await expect(pair).toBeHidden();
  await expect(page.getByRole('button', { name: 'Approved 2' })).toBeVisible();
});

test('reject with a note', async ({ page }) => {
  const card = page.getByRole('article', { name: 'Request from Test003 Student' });
  await card.getByRole('button', { name: 'Reject' }).click();
  await page.getByRole('dialog').getByLabel(/Note/).fill('Not this week.');
  await page.getByRole('dialog').getByRole('button', { name: 'Reject' }).click();
  await page.getByRole('button', { name: 'Rejected 2' }).click();
  await expect(page.getByText('Note: Not this week.')).toBeVisible();
});

test('manual move from Members', async ({ page }) => {
  await page.getByRole('link', { name: 'Members' }).click();
  await page.getByRole('button', { name: 'Actions for Test001 Student' }).click();
  await page.getByRole('menuitem', { name: 'Move Test001 Student to group' }).click();
  const dialog = page.getByRole('dialog', { name: 'Move to group' });
  await expect(dialog.getByLabel('New group')).toBeEnabled();
  await dialog.getByLabel('New group').selectOption('6');
  await expect(dialog.getByRole('group', { name: /Before and after/ })).toBeVisible();
  await dialog.getByRole('button', { name: 'Move', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('row', { name: /Test001 Student/ })).toContainText('6');
});
