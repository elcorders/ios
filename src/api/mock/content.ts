import type {
  AdminContentItem, AdminContentRow, ApiError, ContentItem, ContentKind, ContentStatus, ContentSummary,
  LibraryDetail, LibraryItem, Result, S6Api, S17Api, UpsertContentInput,
} from '../types';
import { getMockCurrentEmail } from './auth';
import { MOCK_ARCHIVED_COHORT, MOCK_COHORT, MOCK_USERS, seedEnrolments } from './fixtures/s1';
import { mockGroupOf } from './survey';
import { resetMockSessions, sessionRows, type MockSessionRow } from './sessionStore';

const ok = <T>(data: T): Result<T> => ({ ok: true, data });
const fail = <T>(code: string): Result<T> => ({ ok: false, error: { code, message: code } satisfies ApiError });

const COHORTS = [MOCK_COHORT, MOCK_ARCHIVED_COHORT];
const MAX_BODY = 2 * 1024 * 1024;

interface MockItem {
  id: string;
  kind: ContentKind;
  cohort_id: string | null;
  title: string;
  summary: string | null;
  position: number;
  /** Resources only; tutorials/materials read the linked version's body (CONTRACT §S17). */
  body_html: string;
  library_id: string | null;
  version_id: string | null;
  published_at: string | null;
  updated_at: string;
}

interface MockLibrary {
  id: string;
  kind: ContentKind;
  title: string;
  summary: string | null;
  updated_at: string;
}

interface MockVersion {
  id: string;
  library_id: string;
  version_no: number;
  body_html: string;
  note: string | null;
  created_at: string;
}

/** Fictional demo page with an inline script, to exercise the sandboxed viewer. */
const page = (title: string) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui;padding:16px;background:#111;color:#eee}button{padding:8px 16px}</style></head>
<body><h1>${title}</h1><p>Fictional mock content.</p><button id="b">Tap me</button> <span id="n">0</span>
<script>let n=0;document.getElementById('b').onclick=()=>{document.getElementById('n').textContent=++n};</script>
</body></html>`;

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

type SeedItem = Omit<MockItem, 'library_id' | 'version_id'>;

function seedItems(): SeedItem[] {
  const now = Date.now();
  const base = { updated_at: iso(now - DAY) };
  return [
    { ...base, id: 'content-r1', kind: 'resource', cohort_id: null, title: 'Lab Mac setup', summary: 'Set up Xcode and GitHub on a lab Mac.', position: 1, body_html: page('Lab Mac setup'), published_at: iso(now - 7 * DAY) },
    { ...base, id: 'content-r2', kind: 'resource', cohort_id: null, title: 'Swift cheat sheet', summary: null, position: 2, body_html: page('Swift cheat sheet'), published_at: null },
    { ...base, id: 'content-t1', kind: 'tutorial', cohort_id: MOCK_COHORT.id, title: 'Tutorial 1 — Demo game', summary: 'Build a tap counter.', position: 1, body_html: page('Tutorial 1'), published_at: iso(now - 3 * DAY) },
    { ...base, id: 'content-t2', kind: 'tutorial', cohort_id: MOCK_COHORT.id, title: 'Tutorial 2 — Scheduled', summary: 'Opens next week.', position: 2, body_html: page('Tutorial 2'), published_at: iso(now + 7 * DAY) },
    { ...base, id: 'content-t3', kind: 'tutorial', cohort_id: MOCK_COHORT.id, title: 'Tutorial 3 — Draft', summary: null, position: 3, body_html: page('Tutorial 3'), published_at: null },
    { ...base, id: 'content-m1', kind: 'material', cohort_id: MOCK_COHORT.id, title: 'Week 2 slides — Layouts', summary: 'Slides for the layouts class.', position: 1, body_html: page('Week 2 slides'), published_at: null },
    { ...base, id: 'content-m2', kind: 'material', cohort_id: MOCK_COHORT.id, title: 'Setup guide', summary: null, position: 2, body_html: page('Setup guide'), published_at: iso(now - 5 * DAY) },
    { ...base, id: 'content-t9', kind: 'tutorial', cohort_id: MOCK_ARCHIVED_COHORT.id, title: 'Old tutorial', summary: null, position: 1, body_html: page('Old tutorial'), published_at: iso(now - 200 * DAY) },
  ];
}

interface Store { items: MockItem[]; libs: MockLibrary[]; versions: MockVersion[] }

/** Every tutorial/material gets its own library + v1. "Tutorial 1" has a v2 and is also linked (at v1) to the archived cohort. */
function seed(): Store {
  const now = Date.now();
  const libs: MockLibrary[] = [];
  const versions: MockVersion[] = [];
  const items: MockItem[] = seedItems().map((s) => {
    if (s.kind === 'resource') return { ...s, library_id: null, version_id: null };
    const library_id = `lib-${s.id}`;
    libs.push({ id: library_id, kind: s.kind, title: s.title, summary: s.summary, updated_at: s.updated_at });
    versions.push({ id: `ver-${s.id}-1`, library_id, version_no: 1, body_html: s.body_html, note: null, created_at: iso(now - 30 * DAY) });
    return { ...s, library_id, version_id: `ver-${s.id}-1` };
  });
  versions.push({
    id: 'ver-content-t1-2', library_id: 'lib-content-t1', version_no: 2, body_html: page('Tutorial 1 (revised)'),
    note: 'Fixed the counter reset', created_at: iso(now - 2 * DAY),
  });
  const t1 = items.find((i) => i.id === 'content-t1')!;
  t1.version_id = 'ver-content-t1-2';
  items.push({
    ...t1, id: 'content-t1-old', cohort_id: MOCK_ARCHIVED_COHORT.id, position: 2, version_id: 'ver-content-t1-1',
    published_at: null,
  });
  return { items, libs, versions };
}

let store = seed();
let items = store.items;
let libs = store.libs;
let versions = store.versions;
let nextId = 1;
const reseed = () => {
  store = seed();
  ({ items, libs, versions } = store);
};

/** Test helper: restore the seeded content. */
export function resetMockContent(): void {
  reseed();
  nextId = 1;
  resetMockSessions();
  ensureFixtureLinks();
}

/** Fixture link: the "Week 2 slides" material is linked to the first upcoming session. */
const FIXTURE_LINKS: [sessionId: string, contentId: string][] = [['00000000-0000-4000-8000-000000001402', 'content-m1']];
const linkedRows = new WeakSet<MockSessionRow[]>();

/** Add the fixture links once per session row array (the store is reset by other modules too). */
export function ensureFixtureLinks(): void {
  const rows = sessionRows();
  if (linkedRows.has(rows)) return;
  linkedRows.add(rows);
  for (const [sid, cid] of FIXTURE_LINKS) {
    const r = rows.find((x) => x.id === sid);
    if (r && !r.content_ids.includes(cid)) r.content_ids.push(cid);
  }
}

const at = (r: MockSessionRow, time: string): number => Date.parse(`${r.date}T${time}:00+05:30`);
/** S18: latest slot start of a session. */
const lastStart = (r: MockSessionRow): number => Math.max(...r.slots.map((x) => at(r, x.start_time)));
const linksOf = (id: string): MockSessionRow[] => {
  ensureFixtureLinks();
  return sessionRows().filter((r) => r.content_ids.includes(id));
};

const currentUser = () => MOCK_USERS.find((u) => u.profile.email === getMockCurrentEmail()) ?? null;
const cohortOf = (id: string | null) => COHORTS.find((c) => c.id === id) ?? null;
const sizeOf = (s: string) => new TextEncoder().encode(s).length;
const versionOf = (i: MockItem) => versions.find((v) => v.id === i.version_id) ?? null;
const bodyOf = (i: MockItem) => versionOf(i)?.body_html ?? i.body_html;
const libVersions = (libId: string) => versions.filter((v) => v.library_id === libId);
const latestOf = (libId: string) => Math.max(0, ...libVersions(libId).map((v) => v.version_no));
const linksOfLib = (libId: string) => items.filter((i) => i.library_id === libId);

const hasSessions = (i: MockItem) => i.kind !== 'resource';

/** CONTRACT §S14 admin status: published / on_session / scheduled / draft. */
function statusOf(i: MockItem): ContentStatus {
  const now = Date.now();
  if (i.published_at && Date.parse(i.published_at) <= now) return 'published';
  const links = hasSessions(i) ? linksOf(i.id) : [];
  if (links.length > 0) return Math.max(...links.map(lastStart)) <= now ? 'published' : 'on_session';
  return i.published_at ? 'scheduled' : 'draft';
}

/** Earliest linked session slot start still in the future. */
function releaseAt(i: MockItem): string | null {
  if (!hasSessions(i)) return null;
  const now = Date.now();
  const future = linksOf(i.id).flatMap((r) => r.slots.map((x) => at(r, x.start_time))).filter((t) => t > now);
  return future.length ? iso(Math.min(...future)) : null;
}

/** Enrolments of the signed-in user (active). */
const myEnrolments = () => {
  const u = currentUser();
  return u ? seedEnrolments().filter((e) => e.user_id === u.profile.id && e.status === 'active') : [];
};

/** CONTRACT §S14 visible_from for the caller (ms), or null when never. Excludes membership. */
function visibleFrom(i: MockItem): number | null {
  const times: number[] = [];
  if (i.published_at) times.push(Date.parse(i.published_at));
  if (hasSessions(i)) {
    const links = linksOf(i.id).filter((r) => r.cohort_id === i.cohort_id);
    if (links.length) {
      times.push(Math.max(...links.map(lastStart)));
      const e = myEnrolments().find((x) => x.cohort_id === i.cohort_id && x.role === 'student');
      const group = e ? mockGroupOf(e.id).group_no : null;
      if (group !== null) {
        for (const r of links) {
          const own = r.slots.find((x) => x.group_nos.includes(group));
          if (own) times.push(at(r, own.start_time));
        }
      }
    }
  }
  return times.length ? Math.min(...times) : null;
}

/** CONTRACT §S6/§S14 visibility rule (applies to admins too). */
function visible(i: MockItem): boolean {
  if (!currentUser()) return false;
  const from = visibleFrom(i);
  if (from === null || from > Date.now()) return false;
  const mine = myEnrolments();
  if (i.kind === 'resource') return mine.some((e) => cohortOf(e.cohort_id)?.status === 'active');
  return mine.some((e) => e.cohort_id === i.cohort_id);
}

/** For §S14 session mocks: link info of a content item (admin view). */
export function mockContentLinkInfo(id: string): { id: string; kind: ContentKind; title: string; status: ContentStatus } | null {
  const i = items.find((x) => x.id === id);
  return i ? { id: i.id, kind: i.kind, title: i.title, status: statusOf(i) } : null;
}
/** For §S14 session mocks: kind/cohort of an item. */
export function mockContentMeta(id: string): { kind: ContentKind; cohort_id: string | null } | null {
  const i = items.find((x) => x.id === id);
  return i ? { kind: i.kind, cohort_id: i.cohort_id } : null;
}
/** For §S14 `get_my_sessions`: is the item visible to the signed-in user now. */
export function mockContentAvailable(id: string): boolean {
  const i = items.find((x) => x.id === id);
  return !!i && visible(i);
}
/** Drop an item's links (deleting content cascades). */
function unlink(id: string): void {
  for (const r of sessionRows()) r.content_ids = r.content_ids.filter((c) => c !== id);
}

const adminRow = (i: MockItem): AdminContentRow => ({
  id: i.id, kind: i.kind, cohort_id: i.cohort_id, title: i.title, summary: i.summary, position: i.position,
  published_at: i.published_at, status: statusOf(i), size_bytes: sizeOf(bodyOf(i)), updated_at: i.updated_at,
  linked_sessions: hasSessions(i) ? linksOf(i.id).length : 0, release_at: releaseAt(i),
  library_id: i.library_id, version_no: versionOf(i)?.version_no ?? null,
  latest_version_no: i.library_id ? latestOf(i.library_id) : null, link_count: i.library_id ? linksOfLib(i.library_id).length : 0,
});

const order = (a: MockItem, b: MockItem) =>
  a.position - b.position || (a.published_at ?? '').localeCompare(b.published_at ?? '') || a.title.localeCompare(b.title);

function requireAdmin(): string | null {
  const u = currentUser();
  if (!u) return 'not_authenticated';
  return u.profile.is_admin ? null : 'forbidden';
}

function archivedTarget(cohortId: string | null): boolean {
  return cohortId !== null && cohortOf(cohortId)?.status === 'archived';
}

export const mockContent: S6Api & S17Api = {
  async listContent(kind) {
    if (!currentUser()) return fail('not_authenticated');
    return ok(
      items.filter((i) => i.kind === kind && visible(i)).sort(order).map((i): ContentSummary => ({
        id: i.id, kind: i.kind, cohort_id: i.cohort_id, cohort_code: cohortOf(i.cohort_id)?.code ?? null,
        title: i.title, summary: i.summary, position: i.position, published_at: iso(visibleFrom(i)!),
      })),
    );
  },

  async getContent(id) {
    if (!currentUser()) return fail('not_authenticated');
    const i = items.find((x) => x.id === id);
    if (!i || !visible(i)) return fail('not_found');
    return ok<ContentItem>({
      id: i.id, kind: i.kind, cohort_code: cohortOf(i.cohort_id)?.code ?? null, title: i.title,
      summary: i.summary, published_at: iso(visibleFrom(i)!), body_html: bodyOf(i),
    });
  },

  async adminListContent(kind, cohortId) {
    const err = requireAdmin();
    if (err) return fail(err);
    if (kind !== 'resource' && !cohortId) return fail('invalid_input');
    return ok(items.filter((i) => i.kind === kind && (kind === 'resource' || i.cohort_id === cohortId)).sort(order).map(adminRow));
  },

  async adminGetContent(id) {
    const err = requireAdmin();
    if (err) return fail(err);
    const i = items.find((x) => x.id === id);
    if (!i) return fail('not_found');
    return ok<AdminContentItem>({
      id: i.id, kind: i.kind, cohort_id: i.cohort_id, cohort_code: cohortOf(i.cohort_id)?.code ?? null,
      title: i.title, summary: i.summary, position: i.position, published_at: i.published_at,
      status: statusOf(i), body_html: bodyOf(i),
    });
  },

  async adminUpsertContent(input: UpsertContentInput) {
    const err = requireAdmin();
    if (err) return fail(err);
    const title = input.title.trim();
    if (!title || title.length > 200 || (input.summary?.length ?? 0) > 500) return fail('invalid_input');
    if ((input.kind !== 'resource') !== (input.cohort_id !== null)) return fail('invalid_input');
    if (input.kind !== 'resource' && !cohortOf(input.cohort_id)) return fail('not_found');
    if (input.body_html !== null && (!input.body_html.trim() || sizeOf(input.body_html) > MAX_BODY)) return fail('invalid_input');
    if (input.kind !== 'resource' && archivedTarget(input.cohort_id)) return fail('cohort_archived');
    const now = new Date().toISOString();
    if (input.id === null) {
      if (input.body_html === null) return fail('invalid_input');
      const i: MockItem = {
        id: `content-new-${nextId++}`, kind: input.kind, cohort_id: input.cohort_id, title, summary: input.summary?.trim() || null,
        position: input.position, body_html: input.body_html, library_id: null, version_id: null, published_at: null, updated_at: now,
      };
      if (i.kind !== 'resource') {
        const libId = `lib-new-${nextId++}`;
        const verId = `ver-new-${nextId++}`;
        libs.push({ id: libId, kind: i.kind, title, summary: i.summary, updated_at: now });
        versions.push({ id: verId, library_id: libId, version_no: 1, body_html: input.body_html, note: null, created_at: now });
        Object.assign(i, { library_id: libId, version_id: verId, body_html: '' });
      }
      items.push(i);
      return ok(adminRow(i));
    }
    const i = items.find((x) => x.id === input.id);
    if (!i) return fail('not_found');
    if (i.kind !== input.kind) return fail('invalid_input');
    Object.assign(i, { cohort_id: input.cohort_id, title, summary: input.summary?.trim() || null, position: input.position, updated_at: now });
    if (input.body_html !== null) {
      if (i.library_id === null) i.body_html = input.body_html;
      else if (input.body_html !== bodyOf(i)) {
        const verId = `ver-new-${nextId++}`;
        versions.push({ id: verId, library_id: i.library_id, version_no: latestOf(i.library_id) + 1, body_html: input.body_html, note: null, created_at: now });
        i.version_id = verId;
        const lib = libs.find((l) => l.id === i.library_id);
        if (lib) lib.updated_at = now;
      }
    }
    return ok(adminRow(i));
  },

  async adminSetContentPublish(id, publishedAt) {
    const err = requireAdmin();
    if (err) return fail(err);
    const i = items.find((x) => x.id === id);
    if (!i) return fail('not_found');
    if (archivedTarget(i.cohort_id)) return fail('cohort_archived');
    if (publishedAt !== null && Number.isNaN(Date.parse(publishedAt))) return fail('invalid_input');
    i.published_at = publishedAt === null ? null : new Date(publishedAt).toISOString();
    i.updated_at = new Date().toISOString();
    return ok(adminRow(i));
  },

  async adminDeleteContent(id) {
    const err = requireAdmin();
    if (err) return fail(err);
    const before = items.length;
    items = items.filter((x) => x.id !== id);
    if (items.length < before) unlink(id);
    return items.length < before ? ok({ ok: true as const }) : fail('not_found');
  },

  async adminCopyTutorials(fromCohortId, toCohortId) {
    const err = requireAdmin();
    if (err) return fail(err);
    if (fromCohortId === toCohortId) return fail('invalid_input');
    if (!cohortOf(fromCohortId) || !cohortOf(toCohortId)) return fail('not_found');
    if (archivedTarget(toCohortId)) return fail('cohort_archived');
    const src = items.filter(
      (i) => i.kind === 'tutorial' && i.cohort_id === fromCohortId && i.library_id !== null &&
        !items.some((t) => t.cohort_id === toCohortId && t.library_id === i.library_id),
    );
    const now = new Date().toISOString();
    for (const s of src) {
      items.push({ ...s, id: `content-new-${nextId++}`, cohort_id: toCohortId, published_at: null, updated_at: now });
    }
    return ok({ copied: src.length });
  },

  async adminListLibrary(kind) {
    const err = requireAdmin();
    if (err) return fail(err);
    if (kind !== 'tutorial' && kind !== 'material') return fail('invalid_input');
    return ok(libs.filter((l) => l.kind === kind).map(libItem).sort((a, b) => a.title.localeCompare(b.title)));
  },

  async adminGetLibrary(id) {
    const err = requireAdmin();
    if (err) return fail(err);
    const l = libs.find((x) => x.id === id);
    return l ? ok(libDetail(l)) : fail('not_found');
  },

  async adminUpsertLibrary(id, title, summary) {
    const err = requireAdmin();
    if (err) return fail(err);
    const l = libs.find((x) => x.id === id);
    if (!l) return fail('not_found');
    const t = title.trim();
    if (!t || t.length > 200 || (summary?.length ?? 0) > 500) return fail('invalid_input');
    Object.assign(l, { title: t, summary: summary?.trim() || null, updated_at: new Date().toISOString() });
    return ok(libItem(l));
  },

  async adminAddLibraryVersion(id, bodyHtml, note) {
    const err = requireAdmin();
    if (err) return fail(err);
    const l = libs.find((x) => x.id === id);
    if (!l) return fail('not_found');
    if (!bodyHtml.trim() || sizeOf(bodyHtml) > MAX_BODY || (note?.length ?? 0) > 200) return fail('invalid_input');
    const now = new Date().toISOString();
    versions.push({
      id: `ver-new-${nextId++}`, library_id: id, version_no: latestOf(id) + 1, body_html: bodyHtml, note: note?.trim() || null, created_at: now,
    });
    l.updated_at = now;
    return ok(libDetail(l));
  },

  async adminSetLinkVersions(versionId, contentIds) {
    const err = requireAdmin();
    if (err) return fail(err);
    const v = versions.find((x) => x.id === versionId);
    if (!v) return fail('not_found');
    if (contentIds.length < 1 || contentIds.length > 200) return fail('invalid_input');
    const targets: MockItem[] = [];
    for (const cid of contentIds) {
      const i = items.find((x) => x.id === cid);
      if (!i) return fail('not_found');
      if (i.library_id !== v.library_id) return fail('invalid_input');
      targets.push(i);
    }
    const now = new Date().toISOString();
    let updated = 0;
    for (const i of new Set(targets)) {
      if (i.version_id === v.id) continue;
      i.version_id = v.id;
      i.updated_at = now;
      updated++;
    }
    return ok({ updated });
  },

  async adminLinkLibrary(id, cohortId, versionId, position) {
    const err = requireAdmin();
    if (err) return fail(err);
    const l = libs.find((x) => x.id === id);
    if (!l || !cohortOf(cohortId)) return fail('not_found');
    const v = versionId === null ? versions.find((x) => x.library_id === id && x.version_no === latestOf(id)) : versions.find((x) => x.id === versionId);
    if (!v) return fail('not_found');
    if (v.library_id !== id || !Number.isInteger(position) || position < 0) return fail('invalid_input');
    if (items.some((i) => i.library_id === id && i.cohort_id === cohortId)) return fail('conflict');
    if (archivedTarget(cohortId)) return fail('cohort_archived');
    const i: MockItem = {
      id: `content-new-${nextId++}`, kind: l.kind, cohort_id: cohortId, title: l.title, summary: l.summary, position, body_html: '',
      library_id: id, version_id: v.id, published_at: null, updated_at: new Date().toISOString(),
    };
    items.push(i);
    return ok(adminRow(i));
  },

  async adminDeleteLibrary(id) {
    const err = requireAdmin();
    if (err) return fail(err);
    if (!libs.some((x) => x.id === id)) return fail('not_found');
    if (linksOfLib(id).length > 0) return fail('conflict');
    libs = libs.filter((x) => x.id !== id);
    versions = versions.filter((v) => v.library_id !== id);
    return ok({ ok: true as const });
  },
};

function libItem(l: MockLibrary): LibraryItem {
  return {
    id: l.id, kind: l.kind, title: l.title, summary: l.summary, latest_version_no: latestOf(l.id),
    version_count: libVersions(l.id).length, updated_at: l.updated_at,
    links: linksOfLib(l.id).map((i) => ({
      content_id: i.id, cohort_id: i.cohort_id!, cohort_code: cohortOf(i.cohort_id)?.code ?? '', cohort_status: cohortOf(i.cohort_id)?.status ?? 'active',
      version_no: versionOf(i)?.version_no ?? 0, status: statusOf(i), published_at: i.published_at,
    })),
  };
}

function libDetail(l: MockLibrary): LibraryDetail {
  return {
    ...libItem(l),
    versions: libVersions(l.id).sort((a, b) => b.version_no - a.version_no).map((v) => ({
      id: v.id, version_no: v.version_no, note: v.note, size_bytes: sizeOf(v.body_html), created_at: v.created_at,
      link_count: items.filter((i) => i.version_id === v.id).length,
    })),
  };
}
