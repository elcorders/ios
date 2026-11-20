import { test, expect } from '@playwright/test';
import { createUser, serviceClient } from './helpers/admin';
import { enrolTotpOnSetup, signInWithEmailCode } from './helpers/flows';

const NAME = 'E2E kiosk screen';

/** Kiosk rows are removed by name (service role); the auth users the logins created go with them. */
async function cleanKiosks(): Promise<void> {
  const sb = serviceClient();
  // Unapproved pairings count towards kiosk-pair's 10 starts per IP per 10 min; clear them (ios-dev only).
  await sb.from('kiosk_pairings').delete().is('device_id', null);
  const { data } = await sb.from('kiosk_devices').select('id, user_id').like('name', 'E2E %');
  for (const d of data ?? []) {
    await sb.from('kiosk_pairings').delete().eq('device_id', d.id);
    await sb.from('kiosk_challenges').delete().eq('device_id', d.id);
    await sb.from('kiosk_devices').delete().eq('id', d.id);
    if (d.user_id) await sb.auth.admin.deleteUser(d.user_id);
  }
}

test.beforeAll(cleanKiosks);
test.afterAll(cleanKiosks);

test('kiosk: pair from the admin phone, board, reload keeps the key, admin sees Online, revoke returns to pairing, delete', async ({ browser }) => {
  test.setTimeout(240_000);
  const admin = await createUser(120, { admin: true, enrol: false });
  void admin;

  // A: the kiosk screen.
  const kCtx = await browser.newContext();
  const kiosk = await kCtx.newPage();
  await kiosk.goto('/#/kiosk');
  await expect(kiosk.getByRole('heading', { name: 'Activate this screen' })).toBeVisible();
  await expect(kiosk.getByLabel('Pairing code')).toHaveText(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/, { timeout: 20_000 });
  const code = (await kiosk.getByLabel('Pairing code').innerText()).trim();

  // B: admin enters the code, names the screen, approves.
  const aCtx = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const phone = await aCtx.newPage();
  await signInWithEmailCode(phone, admin.email);
  await enrolTotpOnSetup(phone); // TOTP, not a passkey: works on any local port
  await phone.goto('/#/kiosk/pair');
  await phone.getByLabel('Code on the screen').fill(code);
  await phone.getByRole('button', { name: 'Check code' }).click();
  await phone.getByLabel('Device name').fill(NAME);
  await phone.getByRole('button', { name: 'Activate' }).click();
  await expect(phone.getByText(`${NAME} is active`)).toBeVisible();

  // A shows the board, with the device name.
  await expect(kiosk.locator('main.kiosk-board')).toBeVisible({ timeout: 30_000 });
  await expect(kiosk.locator('.kiosk-device')).toHaveText(NAME, { timeout: 30_000 });

  // Reload: straight back to the board (key + device id in IndexedDB), no pairing screen.
  await kiosk.reload();
  await expect(kiosk.locator('main.kiosk-board')).toBeVisible({ timeout: 30_000 });
  await expect(kiosk.getByRole('heading', { name: 'Activate this screen' })).toHaveCount(0);

  // Admin > Kiosks shows it Online.
  await phone.goto('/#/admin/kiosks');
  const row = phone.locator('li.kiosk-item', { hasText: NAME });
  await expect(row).toBeVisible();
  await expect(row.getByText('Online')).toBeVisible();

  // Revoke: the server denies the device at once; the screen notices on its next check (15 min) or a manual
  // Refresh (S21.F4), which the test uses, and shows pairing again.
  await row.getByRole('button', { name: `Revoke ${NAME}` }).click();
  await phone.getByRole('dialog').getByRole('button', { name: 'Revoke' }).click();
  await expect(phone.locator('li.kiosk-item', { hasText: NAME }).getByText(/^Revoked/)).toBeVisible();
  await kiosk.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(kiosk.getByRole('heading', { name: 'Activate this screen' })).toBeVisible({ timeout: 30_000 });

  // Delete the revoked screen (S21.B4): gone from the list, its device row and auth user removed.
  const { data: before } = await serviceClient().from('kiosk_devices').select('user_id').eq('name', NAME).single();
  await phone.locator('li.kiosk-item', { hasText: NAME }).getByRole('button', { name: `Delete ${NAME}` }).click();
  await phone.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(phone.getByText(`${NAME} deleted.`)).toBeVisible();
  await expect(phone.locator('li.kiosk-item', { hasText: NAME })).toHaveCount(0);
  const { count } = await serviceClient().from('kiosk_devices').select('id', { count: 'exact', head: true }).eq('name', NAME);
  expect(count).toBe(0);
  const uid = (before as { user_id: string | null }).user_id;
  if (uid) expect((await serviceClient().auth.admin.getUserById(uid)).data.user).toBeNull();

  await kCtx.close();
  await aCtx.close();
});
