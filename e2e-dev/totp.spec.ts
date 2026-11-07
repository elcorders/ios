import { test, expect } from '@playwright/test';
import { createUser } from './helpers/admin';
import { enrolTotpOnSetup, freshTotp, securityOf, signInWithEmailCode, signOut } from './helpers/flows';

test('authenticator app: enrol on setup, then sign in with email + TOTP', async ({ page }) => {
  const user = await createUser(2);
  await signInWithEmailCode(page, user.email);
  const { secret, step } = await enrolTotpOnSetup(page);
  expect(await securityOf(page)).toMatchObject({ totp: true, setup_complete: true });

  await signOut(page);
  await page.goto('/#/login');
  await page.getByRole('tab', { name: 'Authenticator app' }).click();
  await page.getByRole('textbox', { name: 'Email' }).fill(user.email);
  // The server rejects a replay of the step used at enrolment, so wait for the next one.
  await page.getByLabel('Authenticator code').fill(await freshTotp(secret, step));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  await expect(page.getByText(user.email)).toBeVisible();
});
