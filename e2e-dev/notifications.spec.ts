import { test, expect } from '@playwright/test';
import { cohortId, createUser, serviceClient, userClient } from './helpers/admin';
import { accessTokenOf, addPasskeyOnSetup, addVirtualAuthenticator, blockOtpMail, signInWithEmailCode } from './helpers/flows';

// S19 on ios-dev: booking confirmation, custom message to a group (admin UI → student inbox UI),
// closure withdraws a booking + lab_closed, class reminder at 18:00 the evening before (push_tick p_now),
// push-send accepts the cron header.

test.use({ actionTimeout: 15_000 });

const colomboDate = (offsetDays: number): string =>
  new Date(Date.now() + 5.5 * 3_600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);

type Note = { kind: string; title: string; body: string; url: string | null; read_at: string | null };

test('notifications: booking confirmed, custom message, closure withdraw, class reminder, cron auth', async ({ browser }) => {
  const admin = await createUser(190, { admin: true, enrol: false });
  const student = await createUser(191);
  const sb = serviceClient();
  const cohort = await cohortId();

  const sCtx = await browser.newContext();
  const s = await sCtx.newPage();
  await addVirtualAuthenticator(sCtx, s);
  await signInWithEmailCode(s, student.email);
  await addPasskeyOnSetup(s);
  const asStudent = userClient(await accessTokenOf(s));
  const inbox = async () => ((await asStudent.rpc('list_my_notifications', { p_before: null, p_limit: 50 })).data as { items: Note[] }).items;
  const { data: enr } = await sb.from('enrolments').select('group_id').eq('user_id', student.id).single();
  const { data: grp } = await sb.from('groups').select('no').eq('id', enr!.group_id).single();
  const groupNo = grp!.no as number;

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await addVirtualAuthenticator(ctx, page);
  await blockOtpMail(page);
  await signInWithEmailCode(page, admin.email);
  await addPasskeyOnSetup(page);
  const asAdmin = userClient(await accessTokenOf(page));

  // 1. Booking → "Lab booked" in the inbox.
  const cal = await asStudent.rpc('get_lab_calendar', { p_from: colomboDate(3), p_to: colomboDate(14) });
  const day = (cal.data as { days: { date: string; slots: { start: string; full: boolean; blocked: boolean }[] }[] }).days
    .find((d) => d.slots.some((x) => !x.full && !x.blocked))!;
  const slot = day.slots.find((x) => !x.full && !x.blocked)!.start;
  expect((await asStudent.rpc('book_slots', { p_cohort_id: cohort, p_slot_starts: [slot] })).error).toBeNull();
  expect((await inbox()).find((n) => n.kind === 'booking_confirmed')?.title).toBe('Lab booked');

  // 2. Admin UI: custom message to the student's group → student's Notifications page.
  await page.goto('/#/admin/notifications');
  const form = page.getByRole('form', { name: 'Send a message' });
  await form.getByLabel('Groups').check();
  await form.getByLabel(`G${groupNo}`, { exact: true }).check();
  await expect(form.getByRole('status', { name: 'Audience' })).toContainText('students');
  await form.getByLabel('Title').fill('E2E custom title');
  await form.getByLabel('Message').fill('E2E custom body');
  await form.getByRole('button', { name: 'Send message' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Send' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await inbox()).find((n) => n.kind === 'custom')).toMatchObject({ title: 'E2E custom title', body: 'E2E custom body' });

  // 2b. S20: one student — appears in the picker list; only they get it.
  const rec = (await asAdmin.rpc('admin_push_recipients', { p_cohort_id: cohort })).data as { user_id: string; email: string }[];
  expect(rec.some((r) => r.user_id === student.id && r.email === student.email)).toBe(true);
  const one = await asAdmin.rpc('admin_push_custom', {
    p_cohort_id: cohort, p_group_nos: null, p_title: 'E2E just you', p_body: 'E2E one student', p_url: null, p_user_id: student.id,
  });
  expect(one.data).toMatchObject({ queued: 1 });
  expect((await inbox()).find((n) => n.title === 'E2E just you')?.body).toBe('E2E one student');
  const { count: others } = await sb.from('push_outbox').select('id', { count: 'exact', head: true }).eq('title', 'E2E just you').neq('user_id', student.id);
  expect(others).toBe(0);

  await s.goto('/#/');
  await s.reload();
  await expect(s.getByRole('link', { name: /Notifications, \d+ unread/ })).toBeVisible();
  await s.getByRole('link', { name: /^Notifications/ }).first().click();
  await expect(s.getByText('E2E custom title')).toBeVisible();
  await s.getByRole('button', { name: 'Mark all read' }).click();
  await expect(s.getByRole('link', { name: 'Notifications', exact: true })).toBeVisible();
  expect((await asStudent.rpc('get_my_push')).data).toMatchObject({ unread: 0 });

  // 3. Closure on the booked date: impact → withdraw → lab_closed.
  expect((await asAdmin.rpc('admin_closure_impact', { p_from: day.date, p_to: day.date })).data).toMatchObject({ bookings: expect.any(Number) });
  const closed = await asAdmin.rpc('admin_add_closure_range', { p_from: day.date, p_to: day.date, p_kind: 'closed', p_reason: 'E2E closure' });
  expect(closed.error).toBeNull();
  expect((closed.data as { withdrawn: number }).withdrawn).toBeGreaterThanOrEqual(1);
  const { data: bk } = await sb.from('bookings').select('status').eq('user_id', student.id).eq('slot_start', slot).single();
  expect(bk!.status).toBe('withdrawn');
  expect((await inbox()).find((n) => n.kind === 'lab_closed')?.body).toContain('credits returned');

  // 4. Class reminder: session tomorrow for the student's group; tick at 18:05 Colombo today.
  const sess = await asAdmin.rpc('admin_upsert_class_session', {
    p_id: null, p_cohort_id: cohort, p_date: colomboDate(1), p_start_time: null, p_end_time: null, p_title: 'E2E reminder session',
    p_group_nos: null, p_slots: [{ start_time: '10:00', end_time: '12:00', group_nos: [groupNo] }],
    p_deliverables: ['E2E bring laptop'], p_lab_block_until: null, p_content_ids: [], p_notify_content_ids: null,
  });
  expect(sess.error).toBeNull();
  const tick = await sb.rpc('push_tick', { p_now: `${colomboDate(0)}T18:05:00+05:30` });
  expect(tick.error).toBeNull();
  const reminder = (await inbox()).find((n) => n.kind === 'class_reminder' && n.title.includes('E2E reminder session'));
  expect(reminder?.title).toBe('Class tomorrow: E2E reminder session');
  expect(reminder?.body).toContain('10:00–12:00');
  expect(reminder?.body).toContain('E2E bring laptop');
  await sb.rpc('push_tick', { p_now: `${colomboDate(0)}T18:06:00+05:30` });
  expect((await inbox()).filter((n) => n.kind === 'class_reminder' && n.title.includes('E2E reminder session'))).toHaveLength(1);

  // 5. push-send: cron header accepted, wrong one refused.
  const fn = `${process.env['DEV_SUPABASE_URL']}/functions/v1/push-send`;
  const ok = await fetch(fn, { method: 'POST', headers: { 'content-type': 'application/json', 'x-push-cron': process.env['DEV_PUSH_CRON_SECRET']! }, body: '{}' });
  expect(ok.status).toBe(200);
  const bad = await fetch(fn, { method: 'POST', headers: { 'content-type': 'application/json', 'x-push-cron': 'nope' }, body: '{}' });
  expect(bad.status).toBeGreaterThanOrEqual(400);
});
