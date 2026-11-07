import { expect, type BrowserContext, type Page } from '@playwright/test';
import { emailCode, userClient } from './admin';
import { freshTotp, stepOf, totp } from './totp';

/** Chromium virtual authenticator so passkey prompts succeed without hardware. */
export async function addVirtualAuthenticator(context: BrowserContext, page: Page): Promise<void> {
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
    },
  });
}

/** Stop the UI's "Send code" from sending real mail; the code is fetched via the admin API instead. */
export async function blockOtpMail(page: Page): Promise<void> {
  await page.route('**/auth/v1/otp*', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
}

/** Login page -> Email code tab -> type the code. Ends signed in (on /setup or home). */
export async function signInWithEmailCode(page: Page, email: string): Promise<void> {
  await blockOtpMail(page);
  await page.goto('/#/login');
  await page.getByRole('tab', { name: 'Email code' }).click();
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByText('We sent a 6-digit code')).toBeVisible();
  await page.getByLabel('6-digit code').fill(await emailCode(email));
  await page.getByRole('button', { name: 'Verify code' }).click();
}

export async function addPasskeyOnSetup(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Secure your account' })).toBeVisible();
  await page.getByRole('button', { name: 'Add a passkey' }).click();
  await passSurveyGateIfAsked(page);
}

/** S2 gate: answer the one-question survey; returns the group name shown. Ends on Home. */
export async function answerSurvey(page: Page, hasMac: boolean): Promise<string> {
  await expect(page.getByRole('heading', { name: 'Quick question' })).toBeVisible();
  await page.getByRole('button', { name: hasMac ? 'Yes' : 'No', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm' }).click();
  const group = (await page.getByText(/You're in/).locator('strong').innerText()).trim();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  return group;
}

/** After security setup a student who owes the survey lands on it; others go straight Home. */
export async function passSurveyGateIfAsked(page: Page): Promise<void> {
  const home = page.getByRole('heading', { name: 'Home' });
  const survey = page.getByRole('heading', { name: 'Quick question' });
  await expect(home.or(survey)).toBeVisible();
  if (await survey.isVisible()) await answerSurvey(page, false);
}

export async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
}

/** On /setup: choose the authenticator app, enter a code, finish. Returns the secret and the step used. */
export async function enrolTotpOnSetup(page: Page): Promise<{ secret: string; step: number }> {
  await expect(page.getByRole('heading', { name: 'Secure your account' })).toBeVisible();
  await page.getByRole('button', { name: "My device can't use passkeys" }).click();
  const secret = (await page.locator('code').first().innerText()).trim();
  const step = stepOf();
  await page.getByLabel('Authenticator code').fill(totp(secret, step));
  await page.getByRole('button', { name: 'Verify and finish' }).click();
  await passSurveyGateIfAsked(page);
  return { secret, step };
}

export { freshTotp };

/** Read the current session's access token from the page (supabase-js localStorage) for RPC checks. */
export async function accessTokenOf(page: Page): Promise<string> {
  const raw = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && /^sb-.*-auth-token$/.test(k)) return localStorage.getItem(k);
    }
    return null;
  });
  if (!raw) throw new Error('no session in localStorage');
  return (JSON.parse(raw) as { access_token: string }).access_token;
}

export interface Security {
  passkeys: number;
  totp: boolean;
  setup_complete: boolean;
}

/** `get_me().security` as the signed-in user in the page. */
export async function securityOf(page: Page): Promise<Security> {
  const { data, error } = await userClient(await accessTokenOf(page)).rpc('get_me');
  if (error) throw new Error(`get_me: ${error.message}`);
  return (data as { security: Security }).security;
}
