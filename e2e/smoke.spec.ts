import { test, expect } from '@playwright/test';

test('home loads', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.getByRole('banner')).toContainText('NIBM iOS');
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
});
