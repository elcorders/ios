import { test, expect } from '@playwright/test';

test('admin opens Groups and sees the chart legend and group cards', async ({ page }) => {
  await page.goto('/#/login');
  await page.getByRole('tab', { name: 'Email code' }).click();
  await page.getByRole('textbox', { name: 'Email' }).fill('admin@example.edu');
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('6-digit code').fill('123456');
  await page.getByRole('button', { name: 'Verify code' }).click();
  await expect(page.getByText('admin@example.edu')).toBeVisible();

  await page.goto('/#/admin');
  await page.getByRole('link', { name: 'Groups' }).click();
  await expect(page.getByRole('list', { name: 'Legend' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Group 1' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Unassigned / not answered' })).toBeVisible();
});
