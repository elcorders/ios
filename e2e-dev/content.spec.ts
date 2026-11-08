import { test, expect } from '@playwright/test';
import { createUser, serviceClient, userClient } from './helpers/admin';
import { accessTokenOf, addPasskeyOnSetup, addVirtualAuthenticator, signInWithEmailCode } from './helpers/flows';

const TITLE = 'E2E Tutorial S6';
const HTML = `<!doctype html><html><head><title>${TITLE}</title></head><body><h1>Secret lesson</h1>
<button id="b">Tap</button><span id="n">0</span>
<script>document.getElementById('b').onclick=()=>{document.getElementById('n').textContent='1'};</script></body></html>`;

test('admin uploads + schedules a tutorial: hidden from students until published, then viewable', async ({ browser }) => {
  const admin = await createUser(60, { admin: true, enrol: false });
  const student = await createUser(61);

  // Admin: upload as draft, then schedule for tomorrow.
  const aCtx = await browser.newContext();
  const a = await aCtx.newPage();
  await addVirtualAuthenticator(aCtx, a);
  await signInWithEmailCode(a, admin.email);
  await addPasskeyOnSetup(a);
  await a.goto('/#/admin/content');
  await a.getByRole('button', { name: 'Add tutorial' }).click();
  await a.getByLabel(/HTML file/).setInputFiles({ name: 't.html', mimeType: 'text/html', buffer: Buffer.from(HTML) });
  await expect(a.getByLabel('Title')).toHaveValue(TITLE);
  await a.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  const row = a.getByRole('row', { name: new RegExp(TITLE) });
  await expect(row).toContainText('Draft');
  await a.getByRole('button', { name: `Schedule ${TITLE}` }).click();
  const tomorrow = new Date(Date.now() + 5.5 * 3600_000 + 86_400_000).toISOString().slice(0, 16); // Colombo wall clock + 1 day
  await a.getByRole('dialog').locator('input[type="datetime-local"]').fill(tomorrow);
  await a.getByRole('dialog').getByRole('button', { name: /Schedule|Save/ }).last().click();
  await expect(row).toContainText('Scheduled');

  const { data: item } = await serviceClient().from('content_items').select('id, published_at').eq('title', TITLE).single();
  expect(item!.published_at).not.toBeNull();

  // Student: not listed, not fetchable, table not readable.
  const sCtx = await browser.newContext();
  const s = await sCtx.newPage();
  await addVirtualAuthenticator(sCtx, s);
  await signInWithEmailCode(s, student.email);
  await addPasskeyOnSetup(s);
  await s.goto('/#/tutorials');
  await expect(s.getByRole('heading', { name: 'Tutorials' })).toBeVisible();
  await expect(s.getByText(TITLE)).toHaveCount(0);
  const asStudent = userClient(await accessTokenOf(s));
  const got = await asStudent.rpc('get_content', { p_id: item!.id });
  expect(got.error?.message).toBe('not_found');
  const direct = await asStudent.from('content_items').select('body_html').eq('id', item!.id);
  expect(direct.data ?? []).toHaveLength(0);
  expect(JSON.stringify(direct)).not.toContain('Secret lesson');
  await s.goto(`/#/c/${item!.id}`);
  await expect(s.getByText(/Not available yet/).first()).toBeVisible();

  // Admin publishes now -> student sees it and the sandboxed page works.
  await a.getByRole('button', { name: `Publish now ${TITLE}` }).click();
  await expect(row).toContainText('Published');
  await s.goto('/#/tutorials');
  await s.getByRole('link', { name: new RegExp(TITLE) }).click();
  await expect(s.getByRole('heading', { name: TITLE })).toBeVisible();
  const frame = s.frameLocator('iframe.content-frame');
  await expect(frame.getByRole('heading', { name: 'Secret lesson' })).toBeVisible();
  await frame.getByRole('button', { name: 'Tap' }).click();
  await expect(frame.locator('#n')).toHaveText('1');
  const leak = await frame.locator('body').evaluate(() => { try { return window.parent.localStorage.length; } catch { return 'blocked'; } });
  expect(leak).toBe('blocked');

  // Unpublish -> gone again.
  await a.getByRole('button', { name: `Unpublish ${TITLE}` }).click();
  await expect(row).toContainText('Draft');
  expect((await asStudent.rpc('get_content', { p_id: item!.id })).error?.message).toBe('not_found');

  await aCtx.close();
  await sCtx.close();
});
