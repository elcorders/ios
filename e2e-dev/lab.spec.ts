import { test, expect, type Page } from '@playwright/test';
import { cohortId, createUser, serviceClient, userClient } from './helpers/admin';
import { accessTokenOf, addPasskeyOnSetup, addVirtualAuthenticator, signInWithEmailCode } from './helpers/flows';

async function pickFirstFreeSlot(page: Page): Promise<void> {
  const days = page.getByRole('group', { name: 'Day' }).getByRole('button');
  await expect(days.first()).toBeVisible(); // calendar loads after get_my_lab
  const count = await days.count();
  for (let i = 0; i < count; i++) {
    await days.nth(i).click();
    const free = page.getByRole('checkbox').and(page.locator(':enabled'));
    if ((await free.count()) > 0) {
      await free.first().check();
      return;
    }
  }
  throw new Error('no free slot in the horizon');
}

test('no-Mac student books a slot, server enforces rules, withdraws; Mac owner cannot book', async ({ browser }) => {
  const student = await createUser(110); // setup helper answers "No Mac" -> eligible
  const owner = await createUser(111);
  const sb = serviceClient();
  const cohort = await cohortId();

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await addVirtualAuthenticator(ctx, page);
  await signInWithEmailCode(page, student.email);
  await addPasskeyOnSetup(page);

  await page.getByRole('link', { name: /Lab booking/ }).click();
  await expect(page.getByRole('heading', { name: 'Lab booking' })).toBeVisible();
  await pickFirstFreeSlot(page);
  await page.getByRole('button', { name: 'Book 1 slot' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm booking' }).click();
  await expect(page.getByText('Booked 1 slot')).toBeVisible();
  await page.getByRole('dialog', { name: 'Preferred Mac' }).getByRole('button', { name: 'Save' }).click();

  const { data: rows } = await sb.from('bookings').select('id, slot_start, status').eq('user_id', student.id);
  expect(rows).toHaveLength(1);
  expect(rows![0]!.status).toBe('booked');
  const slot = rows![0]!.slot_start as string;

  // Server-side rules through the student's own session.
  const asStudent = userClient(await accessTokenOf(page));
  const again = await asStudent.rpc('book_slots', { p_cohort_id: cohort, p_slot_starts: [slot] });
  expect(again.error?.message).toBe('already_booked');
  const past = await asStudent.rpc('book_slots', { p_cohort_id: cohort, p_slot_starts: ['2026-01-05T10:00:00+05:30'] });
  expect(past.error?.message).toBe('slot_past');
  const direct = await asStudent.from('bookings').update({ status: 'completed' }).eq('id', rows![0]!.id).select();
  expect(direct.data ?? []).toHaveLength(0); // no client write path
  const me = await asStudent.rpc('get_my_lab', { p_cohort_id: cohort });
  expect(me.data).toMatchObject({ eligible: true, credits: { used: 1 } });

  // Withdraw in the UI -> withdrawn, credit back.
  const list = page.getByRole('list', { name: 'My bookings' });
  await list.getByRole('button', { name: /^Withdraw booking/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Withdraw', exact: true }).click();
  await expect(page.getByText('No bookings in this credit period.')).toBeVisible();
  const { data: after } = await sb.from('bookings').select('status').eq('user_id', student.id).single();
  expect(after).toEqual({ status: 'withdrawn' });

  // Mac owner: not eligible, booking refused.
  const oCtx = await browser.newContext();
  const o = await oCtx.newPage();
  await addVirtualAuthenticator(oCtx, o);
  await signInWithEmailCode(o, owner.email);
  await addPasskeyOnSetup(o);
  const { data: oe } = await sb.from('enrolments').select('id').eq('user_id', owner.id).single();
  await sb.from('survey_responses').update({ has_mac: true }).eq('enrolment_id', oe!.id);
  const asOwner = userClient(await accessTokenOf(o));
  const om = await asOwner.rpc('get_my_lab', { p_cohort_id: cohort });
  expect(om.data).toMatchObject({ eligible: false, reason: 'has_mac' });
  const ob = await asOwner.rpc('book_slots', { p_cohort_id: cohort, p_slot_starts: [slot] });
  expect(ob.error?.message).toBe('not_eligible');
  await o.goto('/#/lab');
  await expect(o.getByText(/do not have a Mac of their own/)).toBeVisible();
});
