import { test, expect } from '@playwright/test';
import { cohortId, createUser, serviceClient, userClient } from './helpers/admin';
import { accessTokenOf, addPasskeyOnSetup, addVirtualAuthenticator, blockOtpMail, signInWithEmailCode } from './helpers/flows';

const colomboDate = (offsetDays: number): string =>
  new Date(Date.now() + 5.5 * 3_600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);

test('admin Lab on ios-dev: closure paste + delete, Mac out of service, bookings view, credit adjust', async ({ browser }) => {
  const admin = await createUser(112, { admin: true, enrol: false });
  const student = await createUser(113); // "No Mac" via setup helper -> eligible
  const sb = serviceClient();
  const cohort = await cohortId();

  // Student books one slot through the RPC (UI booking is covered in lab.spec.ts).
  const sCtx = await browser.newContext();
  const s = await sCtx.newPage();
  await addVirtualAuthenticator(sCtx, s);
  await signInWithEmailCode(s, student.email);
  await addPasskeyOnSetup(s);
  const asStudent = userClient(await accessTokenOf(s));
  const cal = await asStudent.rpc('get_lab_calendar', { p_from: colomboDate(1), p_to: colomboDate(14) });
  const day = (cal.data as { days: { date: string; slots: { start: string; full: boolean }[] }[] }).days
    .find((d) => d.slots.some((x) => !x.full))!;
  const slot = day.slots.find((x) => !x.full)!.start;
  const booked = await asStudent.rpc('book_slots', { p_cohort_id: cohort, p_slot_starts: [slot] });
  expect(booked.error).toBeNull();

  // Admin.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await addVirtualAuthenticator(ctx, page);
  await blockOtpMail(page);
  await signInWithEmailCode(page, admin.email);
  await addPasskeyOnSetup(page);

  // Macs: take Mac 13 out of service -> capacity drops; put it back.
  const capOf = async () =>
    ((await asStudent.rpc('get_lab_calendar', { p_from: colomboDate(1), p_to: colomboDate(1) })).data as { capacity: number }).capacity;
  const cap0 = await capOf();
  await page.goto('/#/admin/lab');
  await expect(page.getByRole('table', { name: 'Lab Macs' })).toBeVisible();
  try {
    await page.getByRole('button', { name: 'Take Mac 13 out of service' }).click();
    await expect(page.getByRole('button', { name: 'Return Mac 13 to service' })).toBeVisible();
    expect(await capOf()).toBe(cap0 - 1);
  } finally {
    await sb.from('macs').update({ status: 'in_service' }).eq('no', 13);
  }

  // Closures: paste one far-off date, check DB + audit, delete it in the UI.
  const date = colomboDate(25);
  await page.getByRole('link', { name: 'Closures' }).click();
  await page.getByLabel('Dates (class days)').fill(`${date}, E2E closure`);
  await expect(page.getByText('1 valid, 0 invalid.')).toBeVisible();
  await page.getByRole('button', { name: /^Add 1 class days/ }).click();
  await expect(page.getByText('Added 1, updated 0.')).toBeVisible();
  const { data: cl } = await sb.from('lab_closures').select('id, kind, reason').eq('date', date).single();
  expect(cl).toMatchObject({ kind: 'class_day', reason: 'E2E closure' });
  const studentCal = await asStudent.rpc('get_lab_calendar', { p_from: date, p_to: date });
  expect((studentCal.data as { days: { open: boolean }[] }).days[0]!.open).toBe(false);
  await page.getByRole('button', { name: `Delete class day ${date}` }).click();
  await page.getByRole('dialog', { name: 'Delete closure' }).getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('button', { name: `Delete class day ${date}` })).toHaveCount(0);
  const { data: gone } = await sb.from('lab_closures').select('id').eq('date', date);
  expect(gone).toEqual([]);

  // Bookings: the student's booking shows on its day.
  await page.getByRole('link', { name: 'Bookings' }).click();
  await page.locator('#bk-date').fill(day.date);
  await expect(page.getByText(student.email).or(page.getByText('E2E User113')).first()).toBeVisible();

  // Credits: +3 for the student, recorded and visible to them.
  await page.getByRole('link', { name: 'Credits' }).click();
  const table = page.getByRole('table', { name: /Lab credits/ });
  await expect(table).toBeVisible();
  await page.getByRole('searchbox').or(page.getByLabel(/Search/)).first().fill('User113');
  await table.getByRole('button', { name: /^Adjust credits/ }).first().click();
  await page.getByLabel(/Amount/).fill('3');
  await page.getByLabel('Reason').fill('E2E makeup');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText(/credits left\./)).toBeVisible();
  const me = await asStudent.rpc('get_my_lab', { p_cohort_id: cohort });
  expect(me.data).toMatchObject({ credits: { allowance: 23 } });
  const { data: audit } = await sb.from('audit_log').select('action').eq('actor_id', admin.id);
  expect((audit ?? []).length).toBeGreaterThanOrEqual(4); // mac, closures add + delete, credits
});
