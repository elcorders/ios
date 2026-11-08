import { test, expect } from '@playwright/test';
import { createUser, serviceClient } from './helpers/admin';
import { addPasskeyOnSetup, addVirtualAuthenticator, answerSurvey, blockOtpMail, signInWithEmailCode } from './helpers/flows';

const groupName = async (groupId: string): Promise<string> =>
  ((await serviceClient().from('groups').select('name').eq('id', groupId).single()).data as { name: string }).name;

test('admin resets a survey answer: student is asked again and keeps the group', async ({ browser }) => {
  const admin = await createUser(100, { admin: true, enrol: false });
  const student = await createUser(101);
  const sb = serviceClient();

  // Student signs in; setup helper answers "No" and they get a group.
  const sCtx = await browser.newContext();
  const s = await sCtx.newPage();
  await addVirtualAuthenticator(sCtx, s);
  await signInWithEmailCode(s, student.email);
  await addPasskeyOnSetup(s);
  const { data: enrol } = await sb.from('enrolments').select('id, group_id').eq('user_id', student.id).single();
  expect(enrol!.group_id).toBeTruthy();
  const group = await groupName(enrol!.group_id as string);

  // Admin resets it from Admin › Survey.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await addVirtualAuthenticator(ctx, page);
  await blockOtpMail(page);
  await signInWithEmailCode(page, admin.email);
  await addPasskeyOnSetup(page);
  await page.goto('/#/admin/survey');
  await page.getByLabel('Search').fill(student.email);
  await page.getByLabel(`Select ${student.email}`).check();
  await page.getByRole('button', { name: 'Reset answer' }).click();
  const dialog = page.getByRole('dialog', { name: 'Reset survey answers' });
  await expect(dialog).toContainText('1 student');
  await dialog.getByRole('button', { name: 'Reset' }).click();
  await expect(page.getByText(/Reset 1 answer\./)).toBeVisible();
  await expect(page.getByLabel(`Select ${student.email}`)).toHaveCount(0); // unanswered rows have no checkbox

  const { data: gone } = await sb.from('survey_responses').select('enrolment_id').eq('enrolment_id', enrol!.id);
  expect(gone).toEqual([]);
  const { data: audit } = await sb.from('audit_log').select('before, after').eq('action', 'survey.reset').eq('target_id', enrol!.id);
  expect(audit).toHaveLength(1);
  expect(audit![0]).toMatchObject({ before: { has_mac: false }, after: null });

  // Student's next visit: gate again; a different answer keeps the same group.
  await s.goto('/#/');
  await s.reload();
  await expect(s.getByRole('heading', { name: 'Quick question' })).toBeVisible();
  const again = await answerSurvey(s, true);
  expect(again).toBe(group);
  const { data: after } = await sb.from('enrolments').select('group_id').eq('id', enrol!.id).single();
  expect(after!.group_id).toBe(enrol!.group_id);
  const { data: resp } = await sb.from('survey_responses').select('has_mac').eq('enrolment_id', enrol!.id).single();
  expect(resp).toEqual({ has_mac: true });
});
