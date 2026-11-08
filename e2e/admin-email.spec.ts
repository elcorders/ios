import { test, expect, type Page } from '@playwright/test';

async function signInAsAdmin(page: Page) {
  await page.goto('/#/login');
  await page.getByRole('tab', { name: 'Email code' }).click();
  await page.getByRole('textbox', { name: 'Email' }).fill('admin@example.edu');
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('6-digit code').fill('123456');
  await page.getByRole('button', { name: 'Verify code' }).click();
  await expect(page.getByText('admin@example.edu')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await signInAsAdmin(page);
});

test('change a member email from Edit', async ({ page }) => {
  await page.goto('/#/admin/members');
  await page.getByRole('button', { name: 'Actions for Test001 Student' }).click();
  await page.getByRole('menuitem', { name: 'Edit Test001 Student' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Email').fill('fresh001@example.edu');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toContainText('Sign-in email changes from student001@example.edu to fresh001@example.edu');
  await dialog.getByRole('button', { name: 'Change email' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('cell', { name: 'fresh001@example.edu' })).toBeVisible();
  await page.getByRole('button', { name: 'Actions for Test001 Student' }).click();
  await page.getByRole('menuitem', { name: 'Edit Test001 Student' }).click();
  await expect(page.getByText('Previous emails: student001@example.edu')).toBeVisible();
});

test('import with a new email for an existing index', async ({ page }) => {
  await page.goto('/#/admin/import');
  await page.getByLabel(/File \(CSV/).setInputFiles({
    name: 'roster.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Email,First Name,Last Name,Index No\nfresh001@example.edu,Test001,Student,COBSCCOMP251P-001\n'),
  });
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByText('1 email change')).toBeVisible();
  await expect(page.getByText('Email: student001@example.edu → fresh001@example.edu')).toBeVisible();
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Apply import' }).click();
  await expect(page.getByText(/Import applied: 0 added, 1 updated/)).toBeVisible();
  await page.getByRole('link', { name: 'View students' }).click();
  await expect(page.getByRole('cell', { name: 'fresh001@example.edu' })).toBeVisible();
});
