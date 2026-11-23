import { test, expect } from '@playwright/test';

// S23 (mock, two tabs): the remote's board slider scrolls the kiosk board. On a big screen the board is one
// screen high and scrolls inside `.kiosk-main`, so the kiosk must scroll that box, not the window.
test('remote: board slider scrolls the kiosk board', async ({ context }) => {
  const kiosk = await context.newPage();
  await kiosk.setViewportSize({ width: 1280, height: 420 });
  await kiosk.goto('/#/kiosk?demo=lab&reset=1');
  await kiosk.getByRole('button', { name: 'Simulate approval' }).click();
  await expect(kiosk.getByRole('article', { name: 'Today in the lab' })).toBeVisible();
  const boardTop = () => kiosk.evaluate(() => {
    const m = document.querySelector<HTMLElement>('.kiosk-board .kiosk-main');
    return m && m.scrollHeight > m.clientHeight ? m.scrollTop : window.scrollY;
  });
  expect(await boardTop()).toBe(0);

  const admin = await context.newPage();
  // Same browser profile as the kiosk tab: drop the kiosk-mode flag (S21.F6) so this tab is the normal site.
  await admin.addInitScript(() => localStorage.removeItem('nibm-kiosk-mode'));
  await admin.goto('/#/login');
  await admin.getByRole('tab', { name: 'Email code' }).click();
  await admin.getByRole('textbox', { name: 'Email' }).fill('admin@example.edu');
  await admin.getByRole('button', { name: 'Send code' }).click();
  await admin.getByLabel('6-digit code').fill('123456');
  await admin.getByRole('button', { name: 'Verify code' }).click();
  await expect(admin.getByRole('heading', { name: 'Home' })).toBeVisible();
  await admin.goto('/#/admin/kiosks');
  await admin.getByRole('link', { name: 'Remote Lab 1 wall screen' }).click();
  await admin.getByRole('button', { name: 'Take control' }).click();
  await expect(kiosk.getByText(/Controlled by/)).toBeVisible();

  const slider = admin.getByLabel('Scroll the board');
  await expect(slider).toBeVisible();
  await slider.fill('100');
  await expect.poll(boardTop).toBeGreaterThan(50);
  await slider.fill('0');
  await expect.poll(boardTop).toBe(0);
});
