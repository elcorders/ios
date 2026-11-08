import { test, expect } from '@playwright/test';

test('student without a Mac books a lab slot, sees it under My bookings and withdraws it', async ({ page }) => {
  await page.goto('/#/login');
  await page.getByRole('tab', { name: 'Email code' }).click();
  await page.getByRole('textbox', { name: 'Email' }).fill('student005@example.edu');
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('6-digit code').fill('123456');
  await page.getByRole('button', { name: 'Verify code' }).click();
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();

  await page.getByRole('link', { name: /Lab booking/ }).click();
  await expect(page.getByRole('heading', { name: 'Lab booking' })).toBeVisible();
  await expect(page.getByText('20 of 20')).toBeVisible();

  // Find a day (from the strip) that has a free, bookable slot; today may be mostly in the past.
  const days = page.getByRole('group', { name: 'Day' }).getByRole('button');
  const count = await days.count();
  let picked = false;
  for (let i = 0; i < count && !picked; i++) {
    await days.nth(i).click();
    const free = page.getByRole('checkbox').and(page.locator(':enabled'));
    if ((await free.count()) > 0) {
      await free.first().check();
      picked = true;
    }
  }
  expect(picked).toBe(true);

  await page.getByRole('button', { name: 'Book 1 slot' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm booking' }).click();
  await expect(page.getByText('Booked 1 slot')).toBeVisible();
  await page.getByRole('dialog', { name: 'Preferred Mac' }).getByRole('button', { name: 'Save' }).click();

  const list = page.getByRole('list', { name: 'My bookings' });
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(page.getByText('19 of 20')).toBeVisible();

  await list.getByRole('button', { name: /^Withdraw booking/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Withdraw', exact: true }).click();
  await expect(page.getByText('No bookings in this credit period.')).toBeVisible();
  await expect(page.getByText('20 of 20')).toBeVisible();
});
