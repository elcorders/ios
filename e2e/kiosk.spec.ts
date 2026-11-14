import { test, expect } from '@playwright/test';

test('kiosk: pair (simulated), see the board, open an item, go back', async ({ page }) => {
  await page.goto('/#/kiosk?demo=class&reset=1');
  await expect(page.getByLabel('Pairing code')).toHaveText(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  await page.getByRole('button', { name: 'Simulate approval' }).click();
  await expect(page.getByRole('article', { name: 'In class now' })).toBeVisible();

  await page.getByRole('article', { name: 'In class now' }).getByRole('link', { name: /Setup guide/ }).click();
  await expect(page.getByRole('link', { name: /Back/ })).toBeVisible();
  await expect(page.locator('iframe')).toBeVisible();
  await page.getByRole('link', { name: /Back/ }).click();
  await expect(page.getByRole('article', { name: 'In class now' })).toBeVisible();
  expect(page.url()).toContain('demo=class');

  // A reload keeps the paired device: straight back to the board.
  await page.reload();
  await expect(page.getByRole('article', { name: 'In class now' })).toBeVisible();
});

test('kiosk: lab demo shows today in the lab', async ({ page }) => {
  await page.goto('/#/kiosk?demo=lab&reset=1');
  await page.getByRole('button', { name: 'Simulate approval' }).click();
  await expect(page.getByRole('article', { name: 'Today in the lab' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Next class' })).toBeVisible();
});
