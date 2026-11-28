import { test, expect } from '@playwright/test';
import { cohortId, createUser, serviceClient, userClient } from './helpers/admin';
import { accessTokenOf, addPasskeyOnSetup, addVirtualAuthenticator, blockOtpMail, signInWithEmailCode } from './helpers/flows';

// S24 on ios-dev: a class template made in Admin › Classes › Templates, a class day made from it
// (G-mine on Slot 1 with a tutorial, another group on Slot 2 with nothing). The tutorial opens for
// Slot 1's group only; the slot-end notification goes to that group's student only.

test.use({ actionTimeout: 15_000 });

const colomboToday = (): string => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
const TEMPLATE = `E2E Day ${Date.now().toString(36)}`;
const TUTORIAL = 'E2E slot tutorial';

test('class template + class day: tutorial opens for the Slot 1 group only, slot-end notification goes to that group', async ({ browser }) => {
  const admin = await createUser(180, { admin: true, enrol: false });
  const mineUser = await createUser(181);
  const otherUser = await createUser(182);
  const sb = serviceClient();
  const cohort = await cohortId();

  const signIn = async (email: string) => {
    const c = await browser.newContext();
    const p = await c.newPage();
    await addVirtualAuthenticator(c, p);
    await signInWithEmailCode(p, email);
    await addPasskeyOnSetup(p);
    return { page: p, api: userClient(await accessTokenOf(p)) };
  };
  const mine = await signIn(mineUser.email);
  const other = await signIn(otherUser.email);

  // Put the second student in a different group than the first.
  const groupOf = async (userId: string) => {
    const { data: enr } = await sb.from('enrolments').select('group_id').eq('user_id', userId).single();
    const { data: g } = await sb.from('groups').select('id, no').eq('id', enr!.group_id).single();
    return g as { id: string; no: number };
  };
  const myGroup = await groupOf(mineUser.id);
  const { data: groups } = await sb.from('groups').select('id, no').eq('cohort_id', cohort).order('no');
  const otherGroup = (groups as { id: string; no: number }[]).find((g) => g.no !== myGroup.no)!;
  expect(otherGroup).toBeDefined();
  expect((await sb.from('enrolments').update({ group_id: otherGroup.id }).eq('user_id', otherUser.id)).error).toBeNull();
  const myNo = myGroup.no;
  const otherNo = otherGroup.no;

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await addVirtualAuthenticator(ctx, page);
  await blockOtpMail(page);
  await signInWithEmailCode(page, admin.email);
  await addPasskeyOnSetup(page);
  const asAdmin = userClient(await accessTokenOf(page));

  const made = await asAdmin.rpc('admin_upsert_content', {
    p_id: null, p_kind: 'tutorial', p_cohort_id: cohort, p_title: TUTORIAL, p_summary: null, p_position: 97,
    p_body_html: `<html><body><h1>${TUTORIAL}</h1></body></html>`,
  });
  expect(made.error).toBeNull();
  const tutorialId = (made.data as { id: string }).id;

  // Templates dialog: new template with two slots.
  await page.goto('/#/admin/classes');
  await page.getByRole('button', { name: 'Templates' }).click();
  const t = page.getByRole('dialog');
  await t.getByRole('button', { name: 'New template' }).click();
  const f = page.getByRole('dialog');
  await f.getByLabel('Template name').fill(TEMPLATE);
  const t1 = f.getByRole('group', { name: 'Template slot 1' });
  await t1.getByLabel('Label').fill('Slot 1');
  await t1.getByLabel('Start').fill('00:00');
  await t1.getByLabel('End').fill('23:57');
  await f.getByRole('button', { name: '+ Add slot' }).click();
  const t2 = f.getByRole('group', { name: 'Template slot 2' });
  await t2.getByLabel('Label').fill('Slot 2');
  await t2.getByLabel('Start').fill('23:58');
  await t2.getByLabel('End').fill('23:59');
  await f.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('listitem', { name: TEMPLATE })).toContainText('Slot 2 23:58–23:59');
  await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Class day from the template.
  await page.getByRole('button', { name: 'Add class day' }).click();
  const d = page.getByRole('dialog');
  await d.getByLabel('Title').fill('E2E template session');
  await d.getByLabel('Date').fill(colomboToday());
  await d.getByLabel('Template (optional)').selectOption({ label: TEMPLATE });
  const s1 = d.getByRole('group', { name: 'Slot 1' });
  const s2 = d.getByRole('group', { name: 'Slot 2' });
  await expect(s1.getByLabel('End')).toHaveValue('23:57');
  await expect(s2.getByLabel('Start')).toHaveValue('23:58');
  await s1.getByLabel(`G${myNo}`, { exact: true }).check();
  await expect(s2.getByLabel(`G${myNo}`, { exact: true })).toBeDisabled();
  await s2.getByLabel(`G${otherNo}`, { exact: true }).check();
  await s1.getByRole('button', { name: '+ Add tutorial / material' }).click();
  await s1.getByLabel(new RegExp(TUTORIAL)).check();
  await s1.getByRole('button', { name: 'Done' }).click();
  await expect(s1.getByLabel(`Notify for ${TUTORIAL} in Slot 1`)).toHaveValue('slot_end');
  await d.getByLabel('Lab block').selectOption('none');
  await d.getByRole('button', { name: 'Save' }).click();
  await expect(d).toHaveCount(0);
  const card = page.getByRole('listitem', { name: 'E2E template session' });
  await expect(card).toContainText(TEMPLATE);
  await expect(card).toContainText(TUTORIAL);
  await expect(card).toContainText('Notify at 23:57');

  const sessions = (await asAdmin.rpc('admin_list_class_sessions', { p_cohort_id: cohort })).data as {
    id: string; title: string; template_id: string | null;
    slots: { label: string | null; start_time: string; group_nos: number[]; content: { id: string; notify: string }[] }[];
  }[];
  const sess = sessions.find((x) => x.title === 'E2E template session')!;
  expect(sess.template_id).not.toBeNull();
  expect(sess.slots.map((x) => [x.label, x.start_time, x.group_nos, x.content.map((c) => [c.id, c.notify])])).toEqual([
    ['Slot 1', '00:00', [myNo], [[tutorialId, 'slot_end']]],
    ['Slot 2', '23:58', [otherNo], []],
  ]);

  // Slot 1's student sees the tutorial; the other group's student does not.
  expect((await mine.api.rpc('get_content', { p_id: tutorialId })).error).toBeNull();
  expect((await other.api.rpc('get_content', { p_id: tutorialId })).error?.message).toBe('not_found');
  const ids = async (c: typeof mine.api) => ((await c.rpc('list_content', { p_kind: 'tutorial' })).data as { id: string }[]).map((x) => x.id);
  expect(await ids(mine.api)).toContain(tutorialId);
  expect(await ids(other.api)).not.toContain(tutorialId);
  const ms = (await mine.api.rpc('get_my_sessions', { p_cohort_id: cohort })).data as {
    next: { title: string; content: { id: string; available: boolean }[] } | null;
  };
  expect(ms.next?.title).toBe('E2E template session');
  expect(ms.next?.content).toEqual([expect.objectContaining({ id: tutorialId, available: true })]);
  const os = (await other.api.rpc('get_my_sessions', { p_cohort_id: cohort })).data as { next: { content: unknown[] } | null };
  expect(os.next?.content).toEqual([]);

  // Home: Next session card links to the tutorial.
  await mine.page.goto('/#/');
  await mine.page.reload();
  const home = mine.page.getByRole('region', { name: /Next session/ });
  await expect(home.getByText('E2E template session')).toBeVisible();
  await expect(home.getByRole('link', { name: TUTORIAL })).toBeVisible();

  // Admin › Content shows who it is open for.
  await page.goto('/#/admin/content');
  await expect(page.getByRole('row', { name: new RegExp(TUTORIAL) })).toContainText(`Via classes · open for G${myNo}`);
  const row = ((await asAdmin.rpc('admin_list_content', { p_kind: 'tutorial', p_cohort_id: cohort })).data as
    { id: string; status: string; released_group_nos: number[] }[]).find((r) => r.id === tutorialId)!;
  expect(row).toMatchObject({ status: 'on_session', released_group_nos: [myNo] });

  // Slot-end notification: tick just after Slot 1's end → one content_released row, for Slot 1's student only.
  const tick = await sb.rpc('push_tick', { p_now: `${colomboToday()}T23:57:30+05:30` });
  expect(tick.error).toBeNull();
  const { data: out } = await sb.from('push_outbox').select('user_id, kind').eq('title', `New tutorial: ${TUTORIAL}`);
  const rows = (out ?? []) as { user_id: string; kind: string }[];
  expect(rows.filter((r) => r.user_id === mineUser.id && r.kind === 'content_released')).toHaveLength(1);
  expect(rows.filter((r) => r.user_id === otherUser.id)).toHaveLength(0);
  await sb.rpc('push_tick', { p_now: `${colomboToday()}T23:57:40+05:30` });
  const again = await sb.from('push_outbox').select('id').eq('title', `New tutorial: ${TUTORIAL}`).eq('user_id', mineUser.id);
  expect(again.data).toHaveLength(1);

  // Phone width: the class-day dialog fits without sideways scroll.
  await page.goto('/#/admin/classes');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: /^Edit E2E template session/ }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

  // Clean up what this spec made (users, "E2E …" content and sessions are also swept by global teardown).
  await asAdmin.rpc('admin_delete_class_session', { p_id: sess.id });
  await sb.from('class_templates').delete().eq('name', TEMPLATE);
  await sb.from('content_items').delete().eq('id', tutorialId);
});
