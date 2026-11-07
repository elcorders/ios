import { test, expect } from '@playwright/test';
import { cohortId, createUser, serviceClient, userClient } from './helpers/admin';
import { accessTokenOf, addVirtualAuthenticator, answerSurvey, signInWithEmailCode, signOut } from './helpers/flows';

test('existing student without an answer: setup -> survey gate -> auto group -> Home; not asked again', async ({ page, context }) => {
  const user = await createUser(4);
  await addVirtualAuthenticator(context, page);
  await signInWithEmailCode(page, user.email);
  await expect(page.getByRole('heading', { name: 'Secure your account' })).toBeVisible();
  await page.getByRole('button', { name: 'Add a passkey' }).click();

  // Gate: Home is not reachable until answered.
  await expect(page.getByRole('heading', { name: 'Quick question' })).toBeVisible();
  await page.goto('/#/');
  await expect(page.getByRole('heading', { name: 'Quick question' })).toBeVisible();

  const group = await answerSurvey(page, true);
  expect(group).toMatch(/^Group \d+$/);
  await expect(page.getByText(/Your group:/)).toContainText(group);

  // Server state: one response, enrolment has the group shown.
  const sb = serviceClient();
  const { data: enrol } = await sb.from('enrolments').select('id, group_id, groups(name)').eq('user_id', user.id).single();
  expect((enrol as unknown as { groups: { name: string } }).groups.name).toBe(group);
  const { data: resp } = await sb.from('survey_responses').select('has_mac').eq('enrolment_id', enrol!.id).single();
  expect(resp).toEqual({ has_mac: true });

  // The student can't change it directly (no client write policies) and a retry keeps the answer.
  const token = await accessTokenOf(page);
  const asStudent = userClient(token);
  await asStudent.from('survey_responses').update({ has_mac: false }).eq('enrolment_id', enrol!.id);
  const retry = await asStudent.rpc('submit_survey', { p_cohort_id: await cohortId(), p_has_mac: false });
  expect(retry.data).toMatchObject({ has_mac: true, group_name: group });
  const { data: after } = await sb.from('survey_responses').select('has_mac').eq('enrolment_id', enrol!.id).single();
  expect(after).toEqual({ has_mac: true });

  // Next sign-in goes straight Home.
  await signOut(page);
  await page.getByRole('tab', { name: 'Passkey' }).click();
  await page.getByRole('button', { name: 'Sign in with passkey' }).click();
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  await expect(page.getByText(/Your group:/)).toContainText(group);
});
