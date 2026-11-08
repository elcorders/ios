import { test, expect } from '@playwright/test';
import { createUser, emailOf, serviceClient, userClient } from './helpers/admin';
import { accessTokenOf, addPasskeyOnSetup, addVirtualAuthenticator, blockOtpMail, signInWithEmailCode } from './helpers/flows';

test('admin discards + restores a member and a pending registration; groups tab renders', async ({ browser }) => {
  const admin = await createUser(70, { admin: true, enrol: false });
  const student = await createUser(71);
  const name = 'E2E User71';
  const pendingEmail = emailOf(72);
  const sb = serviceClient();

  // Unknown person opens an LMS link -> pending.
  const lms = await browser.newContext();
  const lp = await lms.newPage();
  await lp.goto(`/#/lms?${new URLSearchParams({ k: 'dev-key-25-2', course: '12345', email: pendingEmail, first: 'Junk', last: 'Row' }).toString()}`);
  await expect(lp.getByRole('heading', { name: 'Not on the class list yet' })).toBeVisible();

  // Student signs in once (to check access after discard).
  const sCtx = await browser.newContext();
  const s = await sCtx.newPage();
  await addVirtualAuthenticator(sCtx, s);
  await signInWithEmailCode(s, student.email);
  await addPasskeyOnSetup(s);
  const asStudent = userClient(await accessTokenOf(s));
  const before = await asStudent.rpc('get_me');
  expect((before.data as { enrolments: unknown[] }).enrolments).toHaveLength(1);

  // Admin.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await addVirtualAuthenticator(ctx, page);
  await blockOtpMail(page);
  await signInWithEmailCode(page, admin.email);
  await addPasskeyOnSetup(page);

  // Discard the member: hidden from Active, shown under Discarded; DB row kept; student loses access.
  await page.goto('/#/admin/members');
  await page.getByRole('searchbox').or(page.getByLabel(/Search/)).first().fill('User71');
  await page.getByRole('button', { name: `Actions for ${name}` }).click();
  await page.getByRole('menuitem', { name: `Discard ${name}` }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Discard' }).click();
  await expect(page.getByRole('cell', { name: student.email })).toHaveCount(0);
  await page.getByRole('button', { name: /^Discarded/ }).click();
  await expect(page.getByRole('cell', { name: student.email })).toBeVisible();
  const { data: enrol } = await sb.from('enrolments').select('status').eq('user_id', student.id).single();
  expect(enrol).toEqual({ status: 'discarded' });
  const after = await asStudent.rpc('get_me');
  expect((after.data as { enrolments: unknown[] }).enrolments).toHaveLength(0);

  // Restore it.
  await page.getByRole('button', { name: `Actions for ${name}` }).click();
  await page.getByRole('menuitem', { name: `Restore ${name}` }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Restore' }).click();
  const { data: restored } = await sb.from('enrolments').select('status').eq('user_id', student.id).single();
  expect(restored).toEqual({ status: 'active' });

  // Discard the pending row; the LMS link does not bring it back; restore.
  await page.goto('/#/admin/pending');
  await page.getByRole('button', { name: `Actions for ${pendingEmail}` }).click();
  await page.getByRole('menuitem', { name: `Discard ${pendingEmail}` }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Discard' }).click();
  await expect(page.getByText(pendingEmail)).toHaveCount(0);
  await lp.reload();
  await lp.goto(`/#/lms?${new URLSearchParams({ k: 'dev-key-25-2', course: '12345', email: pendingEmail }).toString()}`);
  await expect(lp.getByRole('heading', { name: 'Not on the class list yet' })).toBeVisible();
  const { data: p1 } = await sb.from('pending_registrations').select('status').eq('email', pendingEmail).single();
  expect(p1).toEqual({ status: 'discarded' });
  await page.getByRole('button', { name: /^Discarded/ }).click();
  await page.getByRole('button', { name: `Actions for ${pendingEmail}` }).click();
  await page.getByRole('menuitem', { name: `Restore ${pendingEmail}` }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Restore' }).click();
  await expect.poll(async () => (await sb.from('pending_registrations').select('status').eq('email', pendingEmail).single()).data?.status).toBe('pending');

  // Groups tab renders against the real backend.
  await page.goto('/#/admin/groups');
  await expect(page.getByText('Has Mac').first()).toBeVisible();

  await Promise.all([lms.close(), sCtx.close(), ctx.close()]);
});
