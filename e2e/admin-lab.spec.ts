import { test, expect } from '@playwright/test';

test('admin Lab: paste a closure, take a Mac out of service, adjust credits', async ({ page }) => {
  await page.goto('/#/login');
  await page.getByRole('tab', { name: 'Email code' }).click();
  await page.getByRole('textbox', { name: 'Email' }).fill('admin@example.edu');
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('6-digit code').fill('123456');
  await page.getByRole('button', { name: 'Verify code' }).click();
  await expect(page.getByText('admin@example.edu')).toBeVisible();

  await page.goto('/#/admin/lab/macs');
  await expect(page.getByRole('table', { name: 'Lab Macs' })).toBeVisible();
  await page.getByRole('button', { name: 'Take Mac 1 out of service' }).click();
  await expect(page.getByRole('button', { name: 'Return Mac 1 to service' })).toBeVisible();

  await page.getByRole('link', { name: 'Closures' }).click();
  const date = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);
  await page.getByLabel('Dates (lab closures)').fill(`${date}, Exam day`);
  await expect(page.getByText('1 valid, 0 invalid.')).toBeVisible();
  await page.getByRole('button', { name: /^Add 1 lab closures/ }).click();
  await expect(page.getByText('Added 1, updated 0.')).toBeVisible();
  await expect(page.getByRole('table', { name: 'Upcoming lab closures' }).getByText(date)).toBeVisible();

  await page.getByRole('link', { name: 'Credits' }).click();
  const table = page.getByRole('table', { name: /Lab credits/ });
  await expect(table).toBeVisible();
  await table.getByRole('button', { name: /^Adjust credits/ }).first().click();
  await page.getByLabel(/Amount/).fill('5');
  await page.getByLabel('Reason').fill('Makeup session');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText(/credits left\./)).toBeVisible();
});
