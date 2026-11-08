import { test, expect } from '@playwright/test';

test('student opens a published tutorial', async ({ page }) => {
  await page.goto('/#/login');
  await page.getByRole('tab', { name: 'Email code' }).click();
  await page.getByRole('textbox', { name: 'Email' }).fill('student001@example.edu');
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('6-digit code').fill('123456');
  await page.getByRole('button', { name: 'Verify code' }).click();
  await expect(page.getByText('student001@example.edu')).toBeVisible();

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Tutorials' }).click();
  await expect(page.getByRole('heading', { name: 'Tutorials' })).toBeVisible();
  await expect(page.getByText('Tutorial 1 — Demo game')).toBeVisible();
  await expect(page.getByText('Tutorial 2')).toHaveCount(0);
  await expect(page.getByText('Tutorial 3')).toHaveCount(0);
  await page.getByRole('link', { name: /Tutorial 1/ }).click();
  await expect(page.locator('iframe')).toBeVisible();
});
