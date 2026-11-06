import { test, expect } from '@playwright/test';

test('admin sees members and approves a pending registration', async ({ page }) => {
  await page.goto('/#/login');
  await page.getByRole('tab', { name: 'Email code' }).click();
  await page.getByRole('textbox', { name: 'Email' }).fill('admin@example.edu');
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('6-digit code').fill('123456');
  await page.getByRole('button', { name: 'Verify code' }).click();
  await expect(page.getByText('admin@example.edu')).toBeVisible();

  await page.goto('/#/admin');
  await expect(page.getByText('student001@example.edu')).toBeVisible();

  await page.getByRole('link', { name: /^Pending/ }).click();
  await page.getByRole('button', { name: 'Approve student061@example.edu' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Decided (2)')).toBeVisible();
});
