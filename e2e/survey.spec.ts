import { test, expect } from '@playwright/test';

test('student without a survey answer is gated, answers, and sees the group on home', async ({ page }) => {
  await page.goto('/#/login');
  await page.getByRole('tab', { name: 'Email code' }).click();
  await page.getByRole('textbox', { name: 'Email' }).fill('student004@example.edu');
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('6-digit code').fill('123456');
  await page.getByRole('button', { name: 'Verify code' }).click();
  await expect(page.getByText('Do you have access to a Mac now?')).toBeVisible();
  await page.getByRole('button', { name: 'Yes' }).click();
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText(/You're in/)).toContainText('Group');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  await expect(page.getByText(/Your group:/)).toContainText('Group');
});
