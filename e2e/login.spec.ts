import { test, expect } from '@playwright/test';

test('LMS link: URL cleaned, code sign-in lands on home', async ({ page }) => {
  await page.goto(
    '/#/lms?k=dev-key-25-2&course=12345&email=student001@example.edu&idnumber=COBSCCOMP251P-001&first=Test&last=Student',
  );
  await expect(page.getByRole('heading', { name: /Welcome to class 25\.2/ })).toBeVisible();
  expect(page.url()).not.toContain('k=');
  expect(page.url()).not.toContain('student001');
  expect(new URL(page.url()).hash).toBe('#/lms');

  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('6-digit code').fill('123456');
  await page.getByRole('button', { name: 'Verify code' }).click();
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  await expect(page.getByText('student001@example.edu')).toBeVisible();
});

test('passkey sign-in and sign-out', async ({ page }) => {
  await page.goto('/#/login');
  await page.getByRole('button', { name: 'Sign in with passkey' }).click();
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});
