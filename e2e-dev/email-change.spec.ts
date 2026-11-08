import { test, expect } from '@playwright/test';
import { cohortId, createUser, emailOf, indexOf, serviceClient, userClient } from './helpers/admin';
import { accessTokenOf, addPasskeyOnSetup, addVirtualAuthenticator, blockOtpMail, signInWithEmailCode, signOut } from './helpers/flows';

test('import with a known index + new email changes the email; passkey, group stay; old email still matches LMS; admin edit switches back', async ({ browser }) => {
  test.setTimeout(120_000);
  const sb = serviceClient();
  const cid = await cohortId();
  const admin = await createUser(90, { admin: true, enrol: false });
  const student = await createUser(91);
  const oldEmail = student.email;
  const newEmail = emailOf(191);
  const name = 'E2E User91';

  // Student signs in once: passkey + survey -> group.
  const sCtx = await browser.newContext();
  const s = await sCtx.newPage();
  await addVirtualAuthenticator(sCtx, s);
  await signInWithEmailCode(s, oldEmail);
  await addPasskeyOnSetup(s);
  const { data: before } = await sb.from('enrolments').select('group_id').eq('user_id', student.id).single();
  expect(before!.group_id).not.toBeNull();

  // Admin signs in.
  const aCtx = await browser.newContext();
  const page = await aCtx.newPage();
  await addVirtualAuthenticator(aCtx, page);
  await blockOtpMail(page);
  await signInWithEmailCode(page, admin.email);
  await addPasskeyOnSetup(page);
  const asAdmin = userClient(await accessTokenOf(page));

  // Roster import: same index, new email -> an email change, not index_conflict.
  const rows = [{ index_no: indexOf(91), email: newEmail, first_name: 'E2E', last_name: 'User91' }];
  const dry = await asAdmin.functions.invoke('roster-import', { body: { cohort_id: cid, role: 'student', dry_run: true, rows } });
  expect(dry.error).toBeNull();
  expect(dry.data.errors).toEqual([]);
  expect(dry.data.update).toHaveLength(1);
  expect(dry.data.update[0].changes.email).toEqual([oldEmail, newEmail]);
  const applied = await asAdmin.functions.invoke('roster-import', { body: { cohort_id: cid, role: 'student', dry_run: false, rows } });
  expect(applied.error).toBeNull();

  const { data: prof } = await sb.from('profiles').select('email').eq('id', student.id).single();
  expect(prof!.email).toBe(newEmail);
  const { data: authUser } = await sb.auth.admin.getUserById(student.id);
  expect(authUser.user!.email).toBe(newEmail);
  const { data: after } = await sb.from('enrolments').select('group_id, status').eq('user_id', student.id).single();
  expect(after).toEqual({ group_id: before!.group_id, status: 'active' });

  // LMS link with the OLD email (no index/username) still finds the student; the code goes to the new email.
  const landing = await sb.rpc('lms_landing', {
    p_key: 'dev-key-25-2', p_course_id: '12345', p_idnumber: null, p_username: null, p_email: oldEmail, p_first: null, p_last: null,
  });
  expect(landing.error).toBeNull();
  expect(landing.data).toMatchObject({ status: 'roster', email: newEmail });

  // The same passkey still signs the student in, now under the new email.
  await signOut(s);
  await s.goto('/#/login');
  await s.getByRole('button', { name: 'Sign in with passkey' }).click();
  await expect(s.getByRole('heading', { name: 'Home' })).toBeVisible();
  await expect(s.getByText(newEmail)).toBeVisible();

  // Admin edits the email back through Members; the dialog shows the previous email.
  await page.goto('/#/admin/members');
  await page.getByRole('searchbox').or(page.getByLabel(/Search/)).first().fill('User91');
  await page.getByRole('button', { name: `Actions for ${name}` }).click();
  await page.getByRole('menuitem', { name: `Edit ${name}` }).click();
  const edit = page.getByRole('dialog', { name: 'Edit profile' });
  await expect(edit.getByText(`Previous emails: ${oldEmail}`)).toBeVisible();
  await edit.getByLabel('Email').fill(oldEmail);
  await edit.getByRole('button', { name: 'Save' }).click();
  const confirm = page.getByRole('dialog', { name: 'Confirm email change' });
  await confirm.getByRole('button', { name: 'Change email' }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByRole('cell', { name: oldEmail })).toBeVisible();
  const { data: hist } = await sb.from('profile_previous_emails').select('email').eq('user_id', student.id);
  expect((hist ?? []).map((h) => h.email)).toEqual([newEmail]);

  await Promise.all([sCtx.close(), aCtx.close()]);
});
