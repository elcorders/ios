import { test, expect } from '@playwright/test';

test('admin imports a generated CSV and sees the member', async ({ page }) => {
  await page.goto('/#/login');
  await page.getByRole('tab', { name: 'Email code' }).click();
  await page.getByRole('textbox', { name: 'Email' }).fill('admin@example.edu');
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('6-digit code').fill('123456');
  await page.getByRole('button', { name: 'Verify code' }).click();
  await expect(page.getByText('admin@example.edu')).toBeVisible();

  await page.goto('/#/admin/import');
  await page.getByLabel(/File \(CSV/).setInputFiles({
    name: 'roster.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Email,First Name,Last Name\nstudent085@example.edu,Import,Tester\n'),
  });
  await expect(page.getByText('roster.csv: 1 rows.')).toBeVisible();
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByText('Add (1)')).toBeVisible();
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Apply import' }).click();
  await expect(page.getByText(/Import applied: 1 added/)).toBeVisible();

  await page.getByRole('link', { name: 'View students' }).click();
  await expect(page.getByText('student085@example.edu')).toBeVisible();
});
