import { test, expect, type Page } from '@playwright/test';

async function signIn(page: Page, email: string) {
  await page.goto('/#/login');
  await page.getByRole('tab', { name: 'Email code' }).click();
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('6-digit code').fill('123456');
  await page.getByRole('button', { name: 'Verify code' }).click();
  await expect(page.getByText(email)).toBeVisible();
}

test('student inbox: bell badge, list, mark all read', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await signIn(page, 'student005@example.edu');
  const bell = page.getByRole('link', { name: 'Notifications, 2 unread' });
  await expect(bell).toBeVisible();
  await bell.click();
  await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Notification list' }).getByRole('listitem')).toHaveCount(4);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
  await page.getByRole('button', { name: 'Mark all read' }).click();
  await expect(page.getByRole('img', { name: 'Unread' })).toHaveCount(0);
  await page.goto('/#/');
  await expect(page.getByRole('link', { name: 'Notifications', exact: true })).toBeVisible();
});

test('admin sends a message to all students', async ({ page }) => {
  await signIn(page, 'admin@example.edu');
  await page.goto('/#/admin/notifications');
  const form = page.getByRole('form', { name: 'Send a message' });
  await expect(form.getByRole('status', { name: 'Audience' })).toContainText(/\d+ students · \d+ with notifications on/);
  await form.getByLabel('Title').fill('Bring a laptop');
  await form.getByLabel('Message').fill('Tomorrow, room 2.');
  await form.getByRole('button', { name: 'Send message' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: /^Send to \d+ students\?$/ })).toBeVisible();
  await dialog.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText(/^Sent to \d+ students/)).toBeVisible();
  await expect(page.getByRole('table', { name: 'Recent notification batches' }).getByText('Bring a laptop')).toBeVisible();
});
