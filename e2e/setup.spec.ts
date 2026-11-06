import { test, expect } from '@playwright/test';

test('new student is sent to security setup, enrols an authenticator, lands on home', async ({ page }) => {
  await page.goto('/#/login');
  await page.getByRole('tab', { name: 'Email code' }).click();
  await page.getByRole('textbox', { name: 'Email' }).fill('student002@example.edu');
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('6-digit code').fill('123456');
  await page.getByRole('button', { name: 'Verify code' }).click();
  await expect(page.getByRole('heading', { name: 'Secure your account' })).toBeVisible();
  await page.getByRole('button', { name: "My device can't use passkeys" }).click();
  await expect(page.getByAltText(/QR code/)).toBeVisible();
  await page.getByLabel('Authenticator code').fill('123456');
  await page.getByRole('button', { name: 'Verify and finish' }).click();
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
});
