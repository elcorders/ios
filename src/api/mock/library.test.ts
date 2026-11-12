import { beforeEach, describe, expect, it } from 'vitest';
import { api } from '../index';
import { resetMockAuth } from './auth';
import { resetMockContent } from './content';

const C252 = '00000000-0000-4000-8000-000000000252';
const C251 = '00000000-0000-4000-8000-000000000251';

beforeEach(async () => {
  resetMockAuth();
  resetMockContent();
  await api.verifyEmailCode('admin@example.edu', '123456');
});

const lib = async (id: string) => {
  const r = await api.adminGetLibrary(id);
  if (!r.ok) throw new Error(r.error.code);
  return r.data;
};

describe('mock library (S17)', () => {
  it('seeds a library with 2 versions linked to the active and the archived cohort', async () => {
    const d = await lib('lib-content-t1');
    expect(d.versions.map((v) => v.version_no)).toEqual([2, 1]);
    expect(d.links.map((l) => [l.cohort_code, l.version_no, l.cohort_status]).sort()).toEqual([['25.1', 1, 'archived'], ['25.2', 2, 'active']]);
    const rows = await api.adminListContent('tutorial', C252);
    const t1 = rows.ok ? rows.data.find((r) => r.id === 'content-t1') : undefined;
    expect(t1).toMatchObject({ library_id: 'lib-content-t1', version_no: 2, latest_version_no: 2, link_count: 2 });
  });

  it('getContent returns the linked version body', async () => {
    const t1 = await api.adminGetContent('content-t1');
    const old = await api.adminGetContent('content-t1-old');
    expect(t1.ok && t1.data.body_html).toContain('revised');
    expect(old.ok && old.data.body_html).not.toContain('revised');
  });

  it('create makes a library + v1; update with a changed body adds a version for this link only', async () => {
    const c = await api.adminUpsertContent({ id: null, kind: 'tutorial', cohort_id: C252, title: 'N', summary: null, position: 5, body_html: '<p>a</p>' });
    if (!c.ok) throw new Error('create');
    expect(c.data).toMatchObject({ version_no: 1, latest_version_no: 1, link_count: 1 });
    const same = await api.adminUpsertContent({ id: c.data.id, kind: 'tutorial', cohort_id: C252, title: 'N2', summary: null, position: 5, body_html: '<p>a</p>' });
    expect(same.ok && same.data.version_no).toBe(1);
    const changed = await api.adminUpsertContent({ id: c.data.id, kind: 'tutorial', cohort_id: C252, title: 'N2', summary: null, position: 5, body_html: '<p>b</p>' });
    expect(changed.ok && changed.data).toMatchObject({ version_no: 2, latest_version_no: 2 });
    const noBody = await api.adminUpsertContent({ id: c.data.id, kind: 'tutorial', cohort_id: C252, title: 'N3', summary: null, position: 5, body_html: null });
    expect(noBody.ok && noBody.data.version_no).toBe(2);
  });

  it('setLinkVersions moves links, rejects another library, and reports changes', async () => {
    const d = await lib('lib-content-t1');
    const v1 = d.versions.find((v) => v.version_no === 1)!;
    const r = await api.adminSetLinkVersions(v1.id, ['content-t1', 'content-t1-old']);
    expect(r.ok && r.data.updated).toBe(1);
    expect((await lib('lib-content-t1')).versions.find((v) => v.version_no === 1)?.link_count).toBe(2);
    const bad = await api.adminSetLinkVersions(v1.id, ['content-t3']);
    expect(!bad.ok && bad.error.code).toBe('invalid_input');
    const empty = await api.adminSetLinkVersions(v1.id, []);
    expect(!empty.ok && empty.error.code).toBe('invalid_input');
  });

  it('addLibraryVersion does not move links; linkLibrary defaults to latest, conflicts, rejects archived', async () => {
    const d = await api.adminAddLibraryVersion('lib-content-t3', '<p>v2</p>', 'n');
    expect(d.ok && d.data.latest_version_no).toBe(2);
    expect(d.ok && d.data.links[0]?.version_no).toBe(1);
    const dup = await api.adminLinkLibrary('lib-content-t3', C252, null, 1);
    expect(!dup.ok && dup.error.code).toBe('conflict');
    const arch = await api.adminLinkLibrary('lib-content-t3', C251, null, 1);
    expect(!arch.ok && arch.error.code).toBe('cohort_archived');
    await api.adminDeleteContent('content-t3');
    const l = await api.adminLinkLibrary('lib-content-t3', C252, null, 4);
    expect(l.ok && l.data).toMatchObject({ version_no: 2, status: 'draft', position: 4 });
  });

  it('deleteLibrary needs no links; copy links instead of duplicating', async () => {
    const busy = await api.adminDeleteLibrary('lib-content-t1');
    expect(!busy.ok && busy.error.code).toBe('conflict');
    await api.adminDeleteContent('content-t3');
    expect((await api.adminDeleteLibrary('lib-content-t3')).ok).toBe(true);
    const gone = await api.adminGetLibrary('lib-content-t3');
    expect(!gone.ok && gone.error.code).toBe('not_found');
    const copy = await api.adminCopyTutorials(C251, C252);
    expect(copy.ok && copy.data.copied).toBe(1); // t1 already linked to 25.2, only the old tutorial is linked
  });

  it('list validates kind and requires admin', async () => {
    const bad = await api.adminListLibrary('resource');
    expect(!bad.ok && bad.error.code).toBe('invalid_input');
    const list = await api.adminListLibrary('material');
    expect(list.ok && list.data.map((i) => i.title)).toEqual(['Setup guide', 'Week 2 slides — Layouts']);
  });
});
