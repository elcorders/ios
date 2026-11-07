import { test, expect } from '@playwright/test';
import { createUser, emailOf } from './helpers/admin';
import {
  addPasskeyOnSetup,
  addVirtualAuthenticator,
  blockOtpMail,
  enrolTotpOnSetup,
  signInWithEmailCode,
} from './helpers/flows';

test('admin imports a roster, approves a pending registration and resets security', async ({ browser }) => {
  const admin = await createUser(0, { admin: true, enrol: false });
  const target = await createUser(3);

  // Target student enrols an authenticator app in their own browser context.
  const studentCtx = await browser.newContext();
  const studentPage = await studentCtx.newPage();
  await signInWithEmailCode(studentPage, target.email);
  await enrolTotpOnSetup(studentPage);
  await studentCtx.close();

  // Unknown student opens an LMS link and lands in the pending queue.
  const pendingEmail = emailOf(20);
  const lmsCtx = await browser.newContext();
  const lmsPage = await lmsCtx.newPage();
  await lmsPage.goto(
    `/#/lms?${new URLSearchParams({ k: 'dev-key-25-2', course: '12345', email: pendingEmail, idnumber: 'COBSCCOMP251P-020', first: 'Pending', last: 'Person' }).toString()}`,
  );
  await expect(lmsPage.getByRole('heading', { name: 'Not on the class list yet' })).toBeVisible();
  await lmsCtx.close();

  // Admin signs in and passes the security gate with a virtual passkey.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await addVirtualAuthenticator(ctx, page);
  await blockOtpMail(page);
  await signInWithEmailCode(page, admin.email);
  await addPasskeyOnSetup(page);

  // Import two rows.
  await page.goto('/#/admin/import');
  const csv = `Email,First Name,Last Name\n${emailOf(10)},Import,One\n${emailOf(11)},Import,Two\n`;
  await page.getByLabel(/File \(CSV/).setInputFiles({ name: 'roster.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.getByText('roster.csv: 2 rows.')).toBeVisible();
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByText('Add (2)')).toBeVisible();
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Apply import' }).click();
  await expect(page.getByText(/Import applied: 2 added/)).toBeVisible();
  await page.getByRole('link', { name: 'View students' }).click();
  await expect(page.getByRole('cell', { name: emailOf(10) })).toBeVisible();
  await expect(page.getByRole('cell', { name: emailOf(11) })).toBeVisible();

  // Approve the pending registration.
  await page.getByRole('link', { name: /^Pending/ }).click();
  await page.getByRole('button', { name: `Approve ${pendingEmail}` }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Decided (1)')).toBeVisible();
  await page.getByRole('link', { name: 'Members' }).click();
  await expect(page.getByRole('cell', { name: pendingEmail })).toBeVisible();

  // Reset security for the target student: TOTP badge goes from yes to no.
  const row = page.getByRole('row').filter({ hasText: target.email });
  await expect(row.getByText('TOTP yes')).toBeVisible();
  await row.getByRole('button', { name: /^Reset security/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reset' }).click();
  await expect(page.getByRole('row').filter({ hasText: target.email }).getByText('TOTP no')).toBeVisible();

  // Survey tab (S2): the target answered "No" at the gate and has a group.
  await page.getByRole('link', { name: 'Survey' }).click();
  await expect(page.getByRole('heading', { name: 'Survey' })).toBeVisible();
  await expect(page.getByText(/^Answered \d+ \/ \d+$/)).toBeVisible();
  const srow = page.getByRole('row').filter({ hasText: target.email });
  await expect(srow.getByRole('cell', { name: 'No', exact: true })).toBeVisible();
  await expect(srow.getByRole('cell', { name: /^(Group )?\d+$/ })).toBeVisible();
  await ctx.close();
});
