import { test, expect } from '@playwright/test';
import { cohortId, createUser, serviceClient, userClient } from './helpers/admin';
import { accessTokenOf, addPasskeyOnSetup, addVirtualAuthenticator, blockOtpMail, signInWithEmailCode } from './helpers/flows';

// S17 on ios-dev: one tutorial linked to three cohorts; a new upload prompts to update the others
// (active ticked, archived unticked); rollback to v1; students see the linked version's body.

const html = (marker: string) => `<!doctype html><html><head><title>E2E lib tutorial</title></head><body><p>${marker}</p></body></html>`;

test('content library: new version prompt updates selected cohorts, rollback, student sees linked version', async ({ browser }) => {
  const admin = await createUser(170, { admin: true, enrol: false });
  const student = await createUser(171);
  const sb = serviceClient();
  const main = await cohortId();
  const suffix = Date.now().toString(36);
  const { data: extra, error: ce } = await sb.from('cohorts').insert([
    { code: `E2E-A-${suffix}`, batch: 'E2E batch A', lms_course_id: `e2e-a-${suffix}` },
    { code: `E2E-B-${suffix}`, batch: 'E2E batch B', lms_course_id: `e2e-b-${suffix}` },
  ]).select('id, code');
  expect(ce).toBeNull();
  const [a, b] = extra!;

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await addVirtualAuthenticator(ctx, page);
  await blockOtpMail(page);
  await signInWithEmailCode(page, admin.email);
  await addPasskeyOnSetup(page);
  const asAdmin = userClient(await accessTokenOf(page));

  // Create in 25.2 (library + v1), publish, link to A and B; archive B.
  const created = await asAdmin.rpc('admin_upsert_content', {
    p_id: null, p_kind: 'tutorial', p_cohort_id: main, p_title: 'E2E lib tutorial', p_summary: null, p_position: 98,
    p_body_html: html('E2E body v1'),
  });
  expect(created.error).toBeNull();
  const row = created.data as { id: string; library_id: string; version_no: number };
  expect(row.version_no).toBe(1);
  expect((await asAdmin.rpc('admin_set_content_publish', { p_id: row.id, p_published_at: new Date(Date.now() - 60_000).toISOString() })).error).toBeNull();
  const linkA = await asAdmin.rpc('admin_link_library', { p_id: row.library_id, p_cohort_id: a!.id, p_version_id: null, p_position: 1 });
  const linkB = await asAdmin.rpc('admin_link_library', { p_id: row.library_id, p_cohort_id: b!.id, p_version_id: null, p_position: 1 });
  expect(linkA.error).toBeNull();
  expect(linkB.error).toBeNull();
  expect((await asAdmin.rpc('admin_link_library', { p_id: row.library_id, p_cohort_id: a!.id, p_version_id: null, p_position: 1 })).error?.message).toBe('conflict');
  expect((await sb.from('cohorts').update({ status: 'archived' }).eq('id', b!.id)).error).toBeNull();
  const idA = (linkA.data as { id: string }).id;
  const idB = (linkB.data as { id: string }).id;

  // Upload v2 from the 25.2 row → prompt: A ticked, B (archived) unticked → update selected.
  await page.goto('/#/admin/content');
  await page.getByLabel('Cohort').selectOption(main);
  await page.getByRole('button', { name: 'Edit E2E lib tutorial' }).click();
  await page.getByRole('dialog').getByLabel(/HTML file/).setInputFiles({ name: 'v2.html', mimeType: 'text/html', buffer: Buffer.from(html('E2E body v2')) });
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  const prompt = page.getByRole('dialog', { name: /Update other cohorts to v2/ });
  await expect(prompt).toBeVisible();
  await expect(prompt.getByRole('checkbox', { name: new RegExp(a!.code) })).toBeChecked();
  await expect(prompt.getByRole('checkbox', { name: new RegExp(b!.code) })).not.toBeChecked();
  await prompt.getByRole('button', { name: 'Update selected' }).click();
  await expect(page.getByText('Updated 1 cohort to v2.')).toBeVisible();

  const versionOf = async (id: string) => {
    const r = await asAdmin.rpc('admin_get_content', { p_id: id });
    return { v: (r.data as { version_no: number }).version_no, body: (r.data as { body_html: string }).body_html };
  };
  expect((await versionOf(row.id)).v).toBe(2);
  expect((await versionOf(idA)).v).toBe(2);
  expect((await versionOf(idB)).v).toBe(1);

  // Student (25.2) sees v2 immediately (published link stays published).
  const sCtx = await browser.newContext();
  const s = await sCtx.newPage();
  await addVirtualAuthenticator(sCtx, s);
  await signInWithEmailCode(s, student.email);
  await addPasskeyOnSetup(s);
  const asStudent = userClient(await accessTokenOf(s));
  const seen = async () => ((await asStudent.rpc('get_content', { p_id: row.id })).data as { body_html: string }).body_html;
  expect(await seen()).toContain('E2E body v2');

  // Rollback 25.2 to v1 through Version….
  await page.reload();
  await page.getByLabel('Cohort').selectOption(main);
  await page.getByRole('button', { name: 'Version of E2E lib tutorial' }).click();
  const vd = page.getByRole('dialog', { name: /Version of/ });
  await vd.getByRole('radio', { name: /^v1/ }).check();
  await vd.getByRole('button', { name: 'Use this version' }).click();
  await expect(vd).toHaveCount(0);
  expect((await versionOf(row.id)).v).toBe(1);
  expect(await seen()).toContain('E2E body v1');

  // Library view lists the item with its versions and links.
  const lib = await asAdmin.rpc('admin_get_library', { p_id: row.library_id });
  expect(lib.data).toMatchObject({ latest_version_no: 2, version_count: 2 });
  expect((lib.data as { links: unknown[] }).links).toHaveLength(3);
  await page.getByRole('button', { name: 'Library' }).click();
  await expect(page.getByText('E2E lib tutorial').first()).toBeVisible();

  // Cleanup the extra cohorts here (links cascade); the library is removed by global cleanup.
  await sb.from('cohorts').delete().in('id', [a!.id, b!.id]);
});
