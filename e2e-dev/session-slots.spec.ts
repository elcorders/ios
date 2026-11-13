import { test, expect } from '@playwright/test';
import { cohortId, createUser, serviceClient, userClient } from './helpers/admin';
import { accessTokenOf, addPasskeyOnSetup, addVirtualAuthenticator, blockOtpMail, signInWithEmailCode } from './helpers/flows';

// S18 on ios-dev: one class session with two time slots (made in the Admin › Classes dialog);
// a linked material opens per group at its own slot; the student sees their own slot time.

test.use({ actionTimeout: 15_000 });

const colomboToday = (): string => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);

test('class session time slots: dialog, per-group release, own slot time', async ({ browser }) => {
  const admin = await createUser(180, { admin: true, enrol: false });
  const student = await createUser(181);
  const sb = serviceClient();
  const cohort = await cohortId();

  const sCtx = await browser.newContext();
  const s = await sCtx.newPage();
  await addVirtualAuthenticator(sCtx, s);
  await signInWithEmailCode(s, student.email);
  await addPasskeyOnSetup(s);
  const asStudent = userClient(await accessTokenOf(s));
  const { data: enr } = await sb.from('enrolments').select('group_id').eq('user_id', student.id).single();
  const { data: mine } = await sb.from('groups').select('no').eq('id', enr!.group_id).single();
  const { data: all } = await sb.from('groups').select('no').eq('cohort_id', cohort).order('no');
  const myNo = mine!.no as number;
  const otherNo = (all as { no: number }[]).map((g) => g.no).find((n) => n !== myNo)!;
  expect(otherNo).toBeDefined();

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await addVirtualAuthenticator(ctx, page);
  await blockOtpMail(page);
  await signInWithEmailCode(page, admin.email);
  await addPasskeyOnSetup(page);
  const asAdmin = userClient(await accessTokenOf(page));

  const made = await asAdmin.rpc('admin_upsert_content', {
    p_id: null, p_kind: 'material', p_cohort_id: cohort, p_title: 'E2E slot material', p_summary: null, p_position: 97,
    p_body_html: '<html><body><h1>E2E slot material</h1></body></html>',
  });
  expect(made.error).toBeNull();
  const materialId = (made.data as { id: string }).id;

  // Dialog: today; slot 1 (already started) = other group, slot 2 (late tonight) = the student's group.
  await page.goto('/#/admin/classes');
  await page.getByRole('button', { name: 'Add class' }).click();
  const d = page.getByRole('dialog');
  await d.getByLabel('Title').fill('E2E slots session');
  await d.getByLabel('Date').fill(colomboToday());
  const s1 = d.getByRole('group', { name: 'Slot 1' });
  await s1.getByLabel('Start').fill('00:00');
  await s1.getByLabel('End').fill('00:01');
  await s1.getByLabel(`G${otherNo}`, { exact: true }).check();
  await d.getByRole('button', { name: '+ Add slot' }).click();
  const s2 = d.getByRole('group', { name: 'Slot 2' });
  await s2.getByLabel('Start').fill('23:58');
  await s2.getByLabel('End').fill('23:59');
  await expect(s2.getByLabel(`G${otherNo}`, { exact: true })).toBeDisabled();
  await s2.getByLabel(`G${myNo}`, { exact: true }).check();
  await d.getByLabel('Lab block').selectOption('none');
  await d.getByLabel('E2E slot material').check();
  await d.getByRole('button', { name: 'Save' }).click();
  await expect(d).toHaveCount(0);
  await expect(page.getByText(`00:00–00:01 · G${otherNo}`)).toBeVisible();
  await expect(page.getByText(`23:58–23:59 · G${myNo}`)).toBeVisible();

  const sessions = (await asAdmin.rpc('admin_list_class_sessions', { p_cohort_id: cohort })).data as {
    id: string; title: string; start_time: string; end_time: string; slots: { start_time: string; group_nos: number[] }[];
  }[];
  const sess = sessions.find((x) => x.title === 'E2E slots session')!;
  expect(sess).toMatchObject({ start_time: '00:00', end_time: '23:59' });
  expect(sess.slots.map((x) => [x.start_time, x.group_nos])).toEqual([['00:00', [otherNo]], ['23:58', [myNo]]]);

  // Student's own slot hasn't started: not visible, own time shown.
  const ms = (await asStudent.rpc('get_my_sessions', { p_cohort_id: cohort })).data as {
    next: { title: string; start_time: string; end_time: string; slots: unknown[] } | null;
  };
  expect(ms.next).toMatchObject({ title: 'E2E slots session', start_time: '23:58', end_time: '23:59' });
  expect(ms.next!.slots).toHaveLength(2);
  expect((await asStudent.rpc('get_content', { p_id: materialId })).error?.message).toBe('not_found');
  const row = ((await asAdmin.rpc('admin_list_content', { p_kind: 'material', p_cohort_id: cohort })).data as { id: string; status: string }[])
    .find((r) => r.id === materialId)!;
  expect(row.status).toBe('on_session');

  await s.goto('/#/');
  await s.reload();
  const card = s.getByRole('region', { name: /Next session/ });
  await expect(card.getByText('E2E slots session')).toBeVisible();
  await expect(card.getByText(/23:58/)).toBeVisible();

  // Move the student's group into the started slot → material opens for them.
  await page.getByRole('button', { name: /^Edit E2E slots session/ }).click();
  const e = page.getByRole('dialog');
  await e.getByRole('group', { name: 'Slot 2' }).getByLabel(`G${myNo}`, { exact: true }).uncheck();
  await e.getByRole('group', { name: 'Slot 1' }).getByLabel(`G${myNo}`, { exact: true }).check();
  await e.getByRole('button', { name: 'Remove slot 2' }).click();
  await e.getByRole('button', { name: 'Save' }).click();
  await expect(e).toHaveCount(0);
  expect((await asStudent.rpc('get_content', { p_id: materialId })).error).toBeNull();

  // Phone width: the dialog fits without sideways scroll.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: /^Edit E2E slots session/ }).click();
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(wide).toBe(false);
});
