import { test, expect } from '@playwright/test';

test('admin uploads an HTML tutorial and publishes it', async ({ page }) => {
  await page.goto('/#/login');
  await page.getByRole('tab', { name: 'Email code' }).click();
  await page.getByRole('textbox', { name: 'Email' }).fill('admin@example.edu');
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('6-digit code').fill('123456');
  await page.getByRole('button', { name: 'Verify code' }).click();
  await expect(page.getByText('admin@example.edu')).toBeVisible();

  await page.goto('/#/admin');
  await page.getByRole('link', { name: 'Content' }).click();
  await expect(page.getByRole('heading', { name: /^Tutorials/ })).toBeVisible();

  await page.getByRole('button', { name: 'Add tutorial' }).click();
  await page.getByLabel(/HTML file/).setInputFiles({
    name: 'lesson.html',
    mimeType: 'text/html',
    buffer: Buffer.from('<!doctype html><html><head><title>E2E Lesson</title></head><body><p>Hi</p></body></html>'),
  });
  await expect(page.getByLabel('Title')).toHaveValue('E2E Lesson');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();

  const row = page.getByRole('row', { name: /E2E Lesson/ });
  await expect(row).toContainText('Draft');
  await page.getByRole('button', { name: 'Publish now E2E Lesson' }).click();
  await page.getByRole('button', { name: 'Publish without notifying' }).click();
  await expect(row).toContainText('Published');
});
