import { test, expect, type Browser, type Page } from '@playwright/test';
import { createUser, serviceClient } from './helpers/admin';
import { enrolTotpOnSetup, signInWithEmailCode } from './helpers/flows';

// S23.I: real Realtime private channel `kiosk:<id>` between a kiosk context and two admin contexts on ios-dev.
const NAME = 'E2E remote screen';

async function cleanKiosks(): Promise<void> {
  const sb = serviceClient();
  // Unapproved pairings count towards kiosk-pair's 10 starts per IP per 10 min; clear them (ios-dev only).
  await sb.from('kiosk_pairings').delete().is('device_id', null);
  const { data } = await sb.from('kiosk_devices').select('id, user_id').eq('name', NAME);
  for (const d of data ?? []) {
    await sb.from('kiosk_control_sessions').delete().eq('device_id', d.id);
    await sb.from('kiosk_pairings').delete().eq('device_id', d.id);
    await sb.from('kiosk_challenges').delete().eq('device_id', d.id);
    await sb.from('kiosk_devices').delete().eq('id', d.id);
    if (d.user_id) await sb.auth.admin.deleteUser(d.user_id);
  }
}
test.beforeAll(cleanKiosks);
test.afterAll(cleanKiosks);

async function adminPage(browser: Browser, n: number): Promise<Page> {
  const user = await createUser(n, { admin: true, enrol: false });
  const page = await (await browser.newContext()).newPage();
  await signInWithEmailCode(page, user.email);
  await enrolTotpOnSetup(page);
  return page;
}

test('kiosk remote: take control, blank + zoom reach the screen, take-over, release', async ({ browser }) => {
  test.setTimeout(300_000);
  const kiosk = await (await browser.newContext()).newPage();
  await kiosk.goto('/#/kiosk');
  await expect(kiosk.getByLabel('Pairing code')).toHaveText(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/, { timeout: 20_000 });
  const code = (await kiosk.getByLabel('Pairing code').innerText()).trim();

  const a = await adminPage(browser, 121);
  await a.goto('/#/kiosk/pair');
  await a.getByLabel('Code on the screen').fill(code);
  await a.getByRole('button', { name: 'Check code' }).click();
  await a.getByLabel('Device name').fill(NAME);
  await a.getByRole('button', { name: 'Activate' }).click();
  await expect(kiosk.locator('main.kiosk-board')).toBeVisible({ timeout: 30_000 });

  const { data: dev } = await serviceClient().from('kiosk_devices').select('id').eq('name', NAME).single();
  const remote = `/#/admin/kiosks/${(dev as { id: string }).id}/remote`;

  // A takes control: the screen shows the badge and answers with its state (the board).
  await a.goto(remote);
  await a.getByRole('button', { name: 'Take control' }).click();
  await expect(kiosk.locator('.remote-badge')).toHaveText(/^Controlled by E2E /, { timeout: 30_000 });
  await expect(a.getByRole('toolbar', { name: 'Screen controls' })).toBeVisible();
  await expect(a.getByText('Waiting for the screen to answer')).toHaveCount(0, { timeout: 30_000 });

  // Blank on / off and zoom travel over the channel.
  await a.getByRole('button', { name: 'Blank' }).click();
  await expect(kiosk.getByText('Screen paused')).toBeVisible({ timeout: 15_000 });
  await a.getByRole('button', { name: 'Show screen' }).click();
  await expect(kiosk.getByText('Screen paused')).toHaveCount(0, { timeout: 15_000 });
  await a.getByRole('button', { name: 'Zoom in' }).click();
  await expect(kiosk.locator('.kiosk-body')).toHaveAttribute('style', /zoom/, { timeout: 15_000 });
  await a.getByRole('button', { name: 'Reset zoom' }).click();
  await expect(kiosk.locator('.kiosk-body')).not.toHaveAttribute('style', /zoom/, { timeout: 15_000 });

  // B takes over: A's lease ends, the screen stays controlled (now by B), and A's commands are ignored.
  const b = await adminPage(browser, 122);
  await b.goto(remote);
  await b.getByRole('button', { name: 'Take control' }).click();
  await b.getByRole('dialog').getByRole('button', { name: 'Take over' }).click();
  await expect(b.getByRole('toolbar', { name: 'Screen controls' })).toBeVisible({ timeout: 30_000 });
  await expect(a.getByText(/Taken over by/)).toBeVisible({ timeout: 45_000 });
  await expect(kiosk.locator('.remote-badge')).toBeVisible();

  // B releases: the badge goes.
  await b.getByRole('button', { name: 'Release' }).click();
  await expect(kiosk.locator('.remote-badge')).toHaveCount(0, { timeout: 30_000 });
});
