import { test, expect } from '@playwright/test';
import { cohortId, createUser, serviceClient } from './helpers/admin';
import { addPasskeyOnSetup, addVirtualAuthenticator, blockOtpMail, signInWithEmailCode } from './helpers/flows';

test('student requests, admin moves an ungrouped student, approves the swap, rejects; emails queued', async ({ browser }) => {
  test.setTimeout(120_000);
  const sb = serviceClient();
  const cid = await cohortId();
  const admin = await createUser(80, { admin: true, enrol: false });
  const s1 = await createUser(81);
  const s2 = await createUser(82); // no survey answer, no group
  const name1 = 'E2E User81';
  const name2 = 'E2E User82';
  const { data: settings } = await sb.from('cohorts').select('settings').eq('id', cid).single();
  const wasOpen = (settings?.settings as { transfers_open?: boolean } | null)?.transfers_open === true;

  // Admin signs in and opens transfer requests.
  const aCtx = await browser.newContext();
  const page = await aCtx.newPage();
  await addVirtualAuthenticator(aCtx, page);
  await blockOtpMail(page);
  await signInWithEmailCode(page, admin.email);
  await addPasskeyOnSetup(page);
  await page.goto('/#/admin/transfers');
  const sw = page.getByRole('switch', { name: /Transfer requests/ });
  await expect(sw).toBeVisible();
  if ((await sw.getAttribute('aria-checked')) !== 'true') await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'true');

  // Student 1 signs in, answers the survey, gets a group.
  const sCtx = await browser.newContext();
  const s = await sCtx.newPage();
  await addVirtualAuthenticator(sCtx, s);
  await signInWithEmailCode(s, s1.email);
  await addPasskeyOnSetup(s);
  // addPasskeyOnSetup answers the survey gate (No Mac) -> Home shows the group.
  const g1 = Number((await s.getByText('Your group:').locator('strong').innerText()).replace(/\D/g, ''));

  // Admin moves the ungrouped student 2 into another group (manual move).
  const target = g1 === 1 ? 2 : 1;
  await page.goto('/#/admin/members');
  await page.getByRole('searchbox').or(page.getByLabel(/Search/)).first().fill('User82');
  await page.getByRole('button', { name: `Actions for ${name2}` }).click();
  await page.getByRole('menuitem', { name: `Move ${name2} to group` }).click();
  const move = page.getByRole('dialog', { name: 'Move to group' });
  await expect(move.getByLabel('New group')).toBeEnabled();
  await move.getByLabel('New group').selectOption(String(target));
  await move.getByRole('button', { name: 'Move', exact: true }).click();
  await expect(move).toBeHidden();
  const { data: groups } = await sb.from('groups').select('id, no').eq('cohort_id', cid);
  const gid = (no: number) => groups!.find((g) => g.no === no)!.id;
  const { data: e2 } = await sb.from('enrolments').select('id, group_id').eq('user_id', s2.id).single();
  expect(e2!.group_id).toBe(gid(target));

  // Student 1 requests a move to student 2's group (UI).
  await s.goto('/#/transfer');
  await s.getByLabel('Preference 1').selectOption(String(target));
  const other = [1, 2, 3, 4, 5, 6].find((n) => n !== g1 && n !== target)!;
  await s.getByLabel('Preference 2').selectOption(String(other));
  await s.getByLabel('Reason').fill('E2E: I sit with my project partner.');
  await s.getByRole('button', { name: 'Submit' }).click();
  await expect(s.getByRole('heading', { name: 'Your request' })).toBeVisible();

  // Student 2's matching request (fixture row: student 2 has no browser session here).
  const ins = await sb.from('transfer_requests').insert({
    cohort_id: cid, enrolment_id: e2!.id, user_id: s2.id, from_group_id: gid(target),
    pref1_group_id: gid(g1), pref2_group_id: gid(other), reason: 'E2E: swap partner.',
  });
  expect(ins.error).toBeNull();

  // Admin approves the swap pair.
  await page.goto('/#/admin/transfers');
  const pair = page.getByRole('article', { name: `Swap ${name1} and ${name2}` })
    .or(page.getByRole('article', { name: `Swap ${name2} and ${name1}` }));
  await expect(pair.getByText('Sizes unchanged')).toBeVisible();
  await pair.getByRole('button', { name: 'Approve both' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Approve both' }).click();
  await expect(pair).toBeHidden();
  const { data: after } = await sb.from('enrolments').select('user_id, group_id').in('user_id', [s1.id, s2.id]);
  expect(after!.find((r) => r.user_id === s1.id)!.group_id).toBe(gid(target));
  expect(after!.find((r) => r.user_id === s2.id)!.group_id).toBe(gid(g1));

  // Student 1 sees the result.
  await s.reload();
  await expect(s.getByText(`Moved to Group ${target}`)).toBeVisible();

  // Student 1 asks again; admin rejects with a note.
  await s.getByLabel('Preference 1').selectOption(String(other));
  await s.getByLabel('Preference 2').selectOption(String(g1 === other ? 3 : g1));
  await s.getByLabel('Reason').fill('E2E: second try.');
  await s.getByRole('button', { name: 'Submit' }).click();
  await expect(s.getByRole('heading', { name: 'Your request' })).toBeVisible();
  await page.reload();
  const card = page.getByRole('article', { name: `Request from ${name1}` });
  await card.getByRole('button', { name: 'Reject' }).click();
  await page.getByRole('dialog').getByLabel(/Note/).fill('E2E not this week.');
  await page.getByRole('dialog').getByRole('button', { name: 'Reject' }).click();
  await expect(card).toBeHidden();

  // Outbox: moved (s2), approved (s1, s2), rejected (s1); outbox-send marks them skipped (no Brevo key on dev).
  await expect.poll(async () => {
    const { data } = await sb.from('email_outbox').select('kind, to_email, status').in('to_email', [s1.email, s2.email]);
    return (data ?? []).map((r) => `${r.to_email === s1.email ? 's1' : 's2'}:${r.kind}:${r.status}`).sort();
  }, { timeout: 20_000 }).toEqual([
    's1:transfer_approved:skipped', 's1:transfer_rejected:skipped', 's2:group_moved:skipped', 's2:transfer_approved:skipped',
  ]);

  if (!wasOpen) {
    await sw.click();
    await expect(sw).toHaveAttribute('aria-checked', 'false');
  }
  await Promise.all([aCtx.close(), sCtx.close()]);
});
