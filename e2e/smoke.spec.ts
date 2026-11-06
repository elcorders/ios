import { test, expect } from '@playwright/test';

test('signed-out home redirects to sign in', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.getByRole('banner')).toContainText('NIBM iOS');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});
