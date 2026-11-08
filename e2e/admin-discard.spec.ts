import { test, expect } from '@playwright/test';

test('admin discards a pending registration and restores it', async ({ page }) => {
  await page.goto('/#/login');
  await page.getByRole('tab', { name: 'Email code' }).click();
  await page.getByRole('textbox', { name: 'Email' }).fill('admin@example.edu');
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('6-digit code').fill('123456');
  await page.getByRole('button', { name: 'Verify code' }).click();
  await expect(page.getByText('admin@example.edu')).toBeVisible();

  await page.goto('/#/admin/pending');
  const email = 'student061@example.edu';
  await expect(page.getByText(email)).toBeVisible();

  await page.getByRole('button', { name: `Actions for ${email}` }).click();
  await page.getByRole('menuitem', { name: `Discard ${email}` }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Discard' }).click();
  await expect(page.getByText(email)).toHaveCount(0);

  await page.getByRole('button', { name: /^Discarded/ }).click();
  await expect(page.getByText(email)).toBeVisible();

  await page.getByRole('button', { name: `Actions for ${email}` }).click();
  await page.getByRole('menuitem', { name: `Restore ${email}` }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByText(email)).toHaveCount(0);
  await page.getByRole('button', { name: /^Pending/ }).click();
  await expect(page.getByText(email)).toBeVisible();
});
