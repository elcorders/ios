import { createECDH, randomBytes } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { cohortId, createUser, serviceClient, userClient } from './helpers/admin';
import { accessTokenOf, addPasskeyOnSetup, addVirtualAuthenticator, blockOtpMail, signInWithEmailCode } from './helpers/flows';

// S13–S16 on ios-dev: class sessions + publish-on-session, Home next session, lab levels/blocks,
// closure ranges, web push plumbing (fake endpoint — nothing reaches a real device).

const colomboDate = (offsetDays: number): string =>
  new Date(Date.now() + 5.5 * 3_600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);

const fakeSubscription = (tag: string) => {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    p_endpoint: `https://push.invalid/e2e-${tag}-${randomBytes(6).toString('hex')}`,
    p_p256dh: ecdh.getPublicKey().toString('base64url'),
    p_auth: randomBytes(16).toString('base64url'),
    p_user_agent: 'e2e',
  };
};

test('class sessions release materials per group, Home shows next session, lab blocks + levels, ranges, push plumbing', async ({ browser }) => {
  const admin = await createUser(140, { admin: true, enrol: false });
  const student = await createUser(141); // setup helper answers "No Mac" -> grouped
  const sb = serviceClient();
  const cohort = await cohortId();

  // Student signs in (gets a group via the survey).
  const sCtx = await browser.newContext();
  const s = await sCtx.newPage();
  await addVirtualAuthenticator(sCtx, s);
  await signInWithEmailCode(s, student.email);
  await addPasskeyOnSetup(s);
  const asStudent = userClient(await accessTokenOf(s));
  const { data: enr } = await sb.from('enrolments').select('group_id').eq('user_id', student.id).single();
  const { data: grp } = await sb.from('groups').select('no').eq('id', enr!.group_id).single();
  const groupNo = grp!.no as number;

  // Admin signs in.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await addVirtualAuthenticator(ctx, page);
  await blockOtpMail(page);
  await signInWithEmailCode(page, admin.email);
  await addPasskeyOnSetup(page);
  const asAdmin = userClient(await accessTokenOf(page));

  // Two draft materials; a past session (released) and a future one (on session).
  const mk = async (title: string) => {
    const r = await asAdmin.rpc('admin_upsert_content', {
      p_id: null, p_kind: 'material', p_cohort_id: cohort, p_title: title, p_summary: null, p_position: 99,
      p_body_html: `<html><body><h1>${title}</h1></body></html>`,
    });
    expect(r.error).toBeNull();
    return (r.data as { id: string }).id;
  };
  const past = await mk('E2E material past');
  const future = await mk('E2E material future');
  const session = async (date: string, start: string, end: string, title: string, contentId: string) => {
    const r = await asAdmin.rpc('admin_upsert_class_session', {
      p_id: null, p_cohort_id: cohort, p_date: date, p_start_time: start, p_end_time: end, p_title: title,
      p_group_nos: [groupNo], p_deliverables: ['E2E deliverable'], p_lab_block_until: '16:00', p_content_ids: [contentId],
    });
    expect(r.error).toBeNull();
    return r.data as { id: string; lab_block_until: string };
  };
  await session(colomboDate(-1), '09:00', '10:00', 'E2E session past', past);
  const next = await session(colomboDate(1), '06:00', '07:00', 'E2E session next', future);
  expect(next.lab_block_until).toBe('16:00');

  // Admin view: statuses.
  const list = await asAdmin.rpc('admin_list_content', { p_kind: 'material', p_cohort_id: cohort });
  const rows = list.data as { id: string; status: string; release_at: string | null }[];
  expect(rows.find((r) => r.id === past)!.status).toBe('published');
  expect(rows.find((r) => r.id === future)!.status).toBe('on_session');
  expect(rows.find((r) => r.id === future)!.release_at).not.toBeNull();

  // Student: past session's material is visible, the future one is not.
  const mine = await asStudent.rpc('list_content', { p_kind: 'material' });
  const ids = (mine.data as { id: string }[]).map((m) => m.id);
  expect(ids).toContain(past);
  expect(ids).not.toContain(future);
  expect((await asStudent.rpc('get_content', { p_id: future })).error?.message).toBe('not_found');
  const ms = (await asStudent.rpc('get_my_sessions', { p_cohort_id: cohort })).data as {
    next: { title: string; content: { id: string; available: boolean }[] } | null;
  };
  expect(ms.next?.title).toBe('E2E session next');
  expect(ms.next?.content).toEqual([expect.objectContaining({ id: future, available: false })]);

  // Home: next session card.
  await s.goto('/#/');
  await s.reload(); // the page was already on Home before the sessions existed
  const card = s.getByRole('region', { name: /Next session/ });
  await expect(card.getByText('E2E session next')).toBeVisible();
  await expect(card.getByText('E2E deliverable')).toBeVisible();
  await expect(card.getByText(/Opens at your session/)).toBeVisible();
  await s.getByRole('link', { name: 'Materials' }).first().click();
  await expect(s.getByText('E2E material past')).toBeVisible();
  await expect(s.getByText('E2E material future')).toHaveCount(0);

  // Lab: students get levels only; tomorrow is blocked until 16:00 (at least).
  const cal = (await asStudent.rpc('get_lab_calendar', { p_from: colomboDate(1), p_to: colomboDate(1) })).data as {
    capacity: number | null;
    days: { block_until: string | null; open: boolean; slots: { start: string; blocked: boolean; booked: number | null; level: string | null }[] }[];
  };
  expect(cal.capacity).toBeNull();
  const day = cal.days[0]!;
  expect(day.block_until! >= '16:00').toBe(true);
  for (const sl of day.slots) expect(sl.booked).toBeNull();
  const blocked = day.slots.find((x) => x.blocked);
  if (day.open && blocked) {
    expect(blocked.level).toBeNull();
    const b = await asStudent.rpc('book_slots', { p_cohort_id: cohort, p_slot_starts: [blocked.start] });
    expect(b.error?.message).toBe('slot_closed');
  }
  const staff = (await asAdmin.rpc('get_lab_calendar', { p_from: colomboDate(1), p_to: colomboDate(1) })).data as { capacity: number | null };
  expect(typeof staff.capacity).toBe('number');

  // Closure range: add 3 days far ahead, delete as a whole range.
  const range = await asAdmin.rpc('admin_add_closure_range', {
    p_from: colomboDate(40), p_to: colomboDate(42), p_kind: 'closed', p_reason: 'E2E range',
  });
  expect(range.error).toBeNull();
  expect(range.data).toMatchObject({ added: 3, updated: 0 });
  const { data: rc } = await sb.from('lab_closures').select('id').eq('range_id', (range.data as { range_id: string }).range_id);
  const del = await asAdmin.rpc('admin_delete_closure', { p_id: rc![0]!.id, p_whole_range: true });
  expect(del.data).toEqual({ ok: true, deleted: 3 });

  // Admin UI: Classes list + Lab calendar render.
  await page.goto('/#/admin/classes');
  await expect(page.getByText('E2E session next')).toBeVisible();
  await page.goto('/#/admin/lab');
  await expect(page.getByRole('heading', { name: 'Calendar' })).toBeVisible();

  // Push plumbing: no device -> no_devices; fake devices -> push-send tries (VAPID set on ios-dev) and fails on the fake endpoint.
  expect((await asAdmin.rpc('admin_push_test')).error?.message).toBe('no_devices');
  expect((await asStudent.rpc('save_push_subscription', fakeSubscription('s'))).error).toBeNull();
  expect((await asAdmin.rpc('save_push_subscription', fakeSubscription('a'))).error).toBeNull();
  expect((await asStudent.rpc('get_my_push')).data).toMatchObject({ devices: 1 });
  const stats = (await asAdmin.rpc('admin_push_stats')).data as { devices: number; students_with_push: number };
  expect(stats.devices).toBeGreaterThanOrEqual(2);
  expect(stats.students_with_push).toBeGreaterThanOrEqual(1);
  expect((await asAdmin.rpc('admin_push_test')).data).toEqual({ queued: 1 });
  const sent = await asAdmin.functions.invoke('push-send', { body: {} });
  expect(sent.error).toBeNull();
  expect(sent.data).toMatchObject({ skipped: 0 });
  expect((sent.data as { failed: number }).failed).toBeGreaterThanOrEqual(1);
  await page.goto('/#/admin/notifications');
  await expect(page.getByText(/Students with push:/)).toBeVisible();
});
