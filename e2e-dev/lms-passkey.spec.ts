import { test, expect } from '@playwright/test';
import { createUser, emailCode, indexOf } from './helpers/admin';
import { addPasskeyOnSetup, addVirtualAuthenticator, blockOtpMail, securityOf, signOut } from './helpers/flows';

test('LMS link -> email code -> passkey setup -> sign out -> passkey sign-in', async ({ page, context }) => {
  const user = await createUser(1);
  await addVirtualAuthenticator(context, page);
  await blockOtpMail(page);

  const q = new URLSearchParams({
    k: 'dev-key-25-2',
    course: '12345',
    email: user.email,
    idnumber: indexOf(1),
    first: 'E2E',
    last: 'Student',
  });
  await page.goto(`/#/lms?${q.toString()}`);
  await expect(page.getByRole('heading', { name: /Welcome to class 25\.2/ })).toBeVisible();
  // The link parameters are stripped from the URL straight away.
  expect(page.url()).not.toContain('k=');
  expect(page.url()).not.toContain('email=');

  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('6-digit code').fill(await emailCode(user.email));
  await page.getByRole('button', { name: 'Verify code' }).click();

  await addPasskeyOnSetup(page);
  // Server-side proof: get_me as this student reports one passkey (auth.webauthn_credentials is not exposed).
  expect(await securityOf(page)).toMatchObject({ passkeys: 1, setup_complete: true });

  await signOut(page);
  await page.getByRole('tab', { name: 'Passkey' }).click();
  await page.getByRole('button', { name: 'Sign in with passkey' }).click();
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  await expect(page.getByText(user.email)).toBeVisible();
});
