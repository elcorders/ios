import type {
  AdminContentItem, AdminContentRow, ApiError, ContentItem, ContentKind, ContentStatus, ContentSummary,
  Result, S6Api, UpsertContentInput,
} from '../types';
import { getMockCurrentEmail } from './auth';
import { MOCK_ARCHIVED_COHORT, MOCK_COHORT, MOCK_USERS, seedEnrolments } from './fixtures/s1';

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
  body_html: string;
  published_at: string | null;
  updated_at: string;
}

/** Fictional demo page with an inline script, to exercise the sandboxed viewer. */
const page = (title: string) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui;padding:16px;background:#111;color:#eee}button{padding:8px 16px}</style></head>
<body><h1>${title}</h1><p>Fictional mock content.</p><button id="b">Tap me</button> <span id="n">0</span>
<script>let n=0;document.getElementById('b').onclick=()=>{document.getElementById('n').textContent=++n};</script>
</body></html>`;

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

function seed(): MockItem[] {
  const now = Date.now();
  const base = { updated_at: iso(now - DAY) };
  return [
    { ...base, id: 'content-r1', kind: 'resource', cohort_id: null, title: 'Lab Mac setup', summary: 'Set up Xcode and GitHub on a lab Mac.', position: 1, body_html: page('Lab Mac setup'), published_at: iso(now - 7 * DAY) },
    { ...base, id: 'content-r2', kind: 'resource', cohort_id: null, title: 'Swift cheat sheet', summary: null, position: 2, body_html: page('Swift cheat sheet'), published_at: null },
    { ...base, id: 'content-t1', kind: 'tutorial', cohort_id: MOCK_COHORT.id, title: 'Tutorial 1 — Demo game', summary: 'Build a tap counter.', position: 1, body_html: page('Tutorial 1'), published_at: iso(now - 3 * DAY) },
    { ...base, id: 'content-t2', kind: 'tutorial', cohort_id: MOCK_COHORT.id, title: 'Tutorial 2 — Scheduled', summary: 'Opens next week.', position: 2, body_html: page('Tutorial 2'), published_at: iso(now + 7 * DAY) },
    { ...base, id: 'content-t3', kind: 'tutorial', cohort_id: MOCK_COHORT.id, title: 'Tutorial 3 — Draft', summary: null, position: 3, body_html: page('Tutorial 3'), published_at: null },
    { ...base, id: 'content-t9', kind: 'tutorial', cohort_id: MOCK_ARCHIVED_COHORT.id, title: 'Old tutorial', summary: null, position: 1, body_html: page('Old tutorial'), published_at: iso(now - 200 * DAY) },
  ];
}

let items = seed();
let nextId = 1;

/** Test helper: restore the seeded content. */
export function resetMockContent(): void {
  items = seed();
  nextId = 1;
}

const currentUser = () => MOCK_USERS.find((u) => u.profile.email === getMockCurrentEmail()) ?? null;
const cohortOf = (id: string | null) => COHORTS.find((c) => c.id === id) ?? null;
const sizeOf = (s: string) => new TextEncoder().encode(s).length;

function statusOf(i: MockItem): ContentStatus {
  if (!i.published_at) return 'draft';
  return Date.parse(i.published_at) <= Date.now() ? 'published' : 'scheduled';
}

/** CONTRACT §S6 visibility rule (applies to admins too). */
function visible(i: MockItem): boolean {
  if (statusOf(i) !== 'published') return false;
  const u = currentUser();
  if (!u) return false;
  const mine = seedEnrolments().filter((e) => e.user_id === u.profile.id && e.status === 'active');
  if (i.kind === 'resource') return mine.some((e) => cohortOf(e.cohort_id)?.status === 'active');
  return mine.some((e) => e.cohort_id === i.cohort_id);
}

const adminRow = (i: MockItem): AdminContentRow => ({
  id: i.id, kind: i.kind, cohort_id: i.cohort_id, title: i.title, summary: i.summary, position: i.position,
  published_at: i.published_at, status: statusOf(i), size_bytes: sizeOf(i.body_html), updated_at: i.updated_at,
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

export const mockContent: S6Api = {
  async listContent(kind) {
    if (!currentUser()) return fail('not_authenticated');
    return ok(
      items.filter((i) => i.kind === kind && visible(i)).sort(order).map((i): ContentSummary => ({
        id: i.id, kind: i.kind, cohort_id: i.cohort_id, cohort_code: cohortOf(i.cohort_id)?.code ?? null,
        title: i.title, summary: i.summary, position: i.position, published_at: i.published_at!,
      })),
    );
  },

  async getContent(id) {
    if (!currentUser()) return fail('not_authenticated');
    const i = items.find((x) => x.id === id);
    if (!i || !visible(i)) return fail('not_found');
    return ok<ContentItem>({
      id: i.id, kind: i.kind, cohort_code: cohortOf(i.cohort_id)?.code ?? null, title: i.title,
      summary: i.summary, published_at: i.published_at!, body_html: i.body_html,
    });
  },

  async adminListContent(kind, cohortId) {
    const err = requireAdmin();
    if (err) return fail(err);
    if (kind === 'tutorial' && !cohortId) return fail('invalid_input');
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
      status: statusOf(i), body_html: i.body_html,
    });
  },

  async adminUpsertContent(input: UpsertContentInput) {
    const err = requireAdmin();
    if (err) return fail(err);
    const title = input.title.trim();
    if (!title || title.length > 200 || (input.summary?.length ?? 0) > 500) return fail('invalid_input');
    if ((input.kind === 'tutorial') !== (input.cohort_id !== null)) return fail('invalid_input');
    if (input.kind === 'tutorial' && !cohortOf(input.cohort_id)) return fail('not_found');
    if (input.body_html !== null && (!input.body_html.trim() || sizeOf(input.body_html) > MAX_BODY)) return fail('invalid_input');
    if (input.kind === 'tutorial' && archivedTarget(input.cohort_id)) return fail('cohort_archived');
    const now = new Date().toISOString();
    if (input.id === null) {
      if (input.body_html === null) return fail('invalid_input');
      const i: MockItem = {
        id: `content-new-${nextId++}`, kind: input.kind, cohort_id: input.cohort_id, title, summary: input.summary?.trim() || null,
        position: input.position, body_html: input.body_html, published_at: null, updated_at: now,
      };
      items.push(i);
      return ok(adminRow(i));
    }
    const i = items.find((x) => x.id === input.id);
    if (!i) return fail('not_found');
    if (i.kind !== input.kind) return fail('invalid_input');
    Object.assign(i, {
      cohort_id: input.cohort_id, title, summary: input.summary?.trim() || null, position: input.position,
      body_html: input.body_html ?? i.body_html, updated_at: now,
    });
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
    return items.length < before ? ok({ ok: true as const }) : fail('not_found');
  },

  async adminCopyTutorials(fromCohortId, toCohortId) {
    const err = requireAdmin();
    if (err) return fail(err);
    if (fromCohortId === toCohortId) return fail('invalid_input');
    if (!cohortOf(fromCohortId) || !cohortOf(toCohortId)) return fail('not_found');
    if (archivedTarget(toCohortId)) return fail('cohort_archived');
    const src = items.filter((i) => i.kind === 'tutorial' && i.cohort_id === fromCohortId);
    const now = new Date().toISOString();
    for (const s of src) {
      items.push({ ...s, id: `content-new-${nextId++}`, cohort_id: toCohortId, published_at: null, updated_at: now });
    }
    return ok({ copied: src.length });
  },
};
