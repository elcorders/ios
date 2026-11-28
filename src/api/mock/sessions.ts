import type { ApiError, ClassSession, ClassSessionInput, ClassTemplate, ClassTemplateInput, MySession, MySessions, Result, S14Api, SlotContent } from '../types';
import { getMockCurrentEmail } from './auth';
import { ensureFixtureLinks, mockContentAvailable, mockContentLinkInfo, mockContentMeta } from './content';
import { MOCK_ARCHIVED_COHORT, MOCK_COHORT, MOCK_USERS, seedEnrolments } from './fixtures/s1';
import { rowSpan, sessionRows, templateRows, type MockSessionRow, type MockSlot, type MockSlotContent, type MockTemplate } from './sessionStore';
import { MOCK_GROUP_COUNT, mockGroupOf } from './survey';

const ok = <T>(data: T): Result<T> => ({ ok: true, data });
const fail = <T>(code: string, field?: string): Result<T> => ({
  ok: false,
  error: { code, message: code, ...(field ? { details: { field } } : {}) } satisfies ApiError,
});

const COHORTS = [MOCK_COHORT, MOCK_ARCHIVED_COHORT];
const currentUser = () => MOCK_USERS.find((u) => u.profile.email === getMockCurrentEmail()) ?? null;
const cohortOf = (id: string) => COHORTS.find((c) => c.id === id) ?? null;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const instant = (date: string, time: string) => new Date(`${date}T${time}:00+05:30`).toISOString();

const asc = (n: number[]) => [...n].sort((x, y) => x - y);

const slotId = (r: MockSessionRow, i: number) => `${r.id.slice(0, -2)}${String(i + 1).padStart(2, '0')}`;

function slotContent(x: MockSlot): SlotContent[] {
  return x.content.flatMap((c) => {
    const info = mockContentLinkInfo(c.content_id);
    return info ? [{ ...info, notify: c.notify, notify_at: c.notify_at, notified: c.notified }] : [];
  });
}

/** Distinct items over the given slots. */
function distinctContent(slots: MockSlot[]): ClassSession['content'] {
  const seen = new Set<string>();
  return slots.flatMap((x) => x.content).flatMap((c) => {
    if (seen.has(c.content_id)) return [];
    seen.add(c.content_id);
    const info = mockContentLinkInfo(c.content_id);
    return info ? [info] : [];
  });
}

function toSession(r: MockSessionRow): ClassSession {
  const span = rowSpan(r);
  const all = new Set(r.slots.flatMap((x) => x.group_nos));
  return {
    id: r.id, cohort_id: r.cohort_id, date: r.date, ...span,
    starts_at: instant(r.date, span.start_time), ends_at: instant(r.date, span.end_time),
    title: r.title, group_nos: asc([...all]),
    slots: r.slots.map((x, i) => ({
      id: slotId(r, i), label: x.label, start_time: x.start_time, end_time: x.end_time,
      starts_at: instant(r.date, x.start_time), ends_at: instant(r.date, x.end_time), group_nos: asc(x.group_nos),
      content: slotContent(x),
    })),
    deliverables: [...r.deliverables],
    lab_block_until: r.lab_block_until,
    content: distinctContent(r.slots),
    template_id: r.template_id,
  };
}

let idSeq = 0;
function newId(): string {
  const ids = new Set(sessionRows().map((r) => r.id));
  let id: string;
  do id = `00000000-0000-4000-8000-0000000149${String(++idSeq).padStart(2, '0')}`;
  while (ids.has(id));
  return id;
}

const byStart = (a: MockSessionRow, b: MockSessionRow) => a.date.localeCompare(b.date) || rowSpan(a).start_time.localeCompare(rowSpan(b).start_time);

function requireAdmin(): string | null {
  const u = currentUser();
  if (!u) return 'not_authenticated';
  return u.profile.is_admin ? null : 'forbidden';
}

function validDate(d: string): boolean {
  return DATE_RE.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d);
}

interface Valid { deliverables: string[]; slots: MockSlot[]; title: string }
type Checked = Valid | { field: string };
const bad = (field: string): { field: string } => ({ field });

function validate(i: ClassSessionInput): Checked {
  const title = i.title.trim();
  if (!title || title.length > 200) return bad('title');
  if (!validDate(i.date)) return bad('date');
  if (i.lab_block_until !== null && !TIME_RE.test(i.lab_block_until) && i.lab_block_until !== '24:00') return bad('lab_block_until');
  if (!Array.isArray(i.slots) || i.slots.length < 1 || i.slots.length > 6) return bad('slots');
  if (i.template_id !== null && !templateRows().some((t) => t.id === i.template_id)) return bad('template');
  const seen = new Set<number>();
  const slots: MockSlot[] = [];
  for (const sl of i.slots) {
    if (!TIME_RE.test(sl.start_time) || !TIME_RE.test(sl.end_time) || sl.start_time >= sl.end_time) return bad('time');
    const groups = [...new Set(sl.group_nos)];
    if (groups.length === 0 || groups.some((g) => !Number.isInteger(g) || g < 1 || g > MOCK_GROUP_COUNT)) return bad('groups');
    if (groups.some((g) => seen.has(g))) return bad('groups');
    groups.forEach((g) => seen.add(g));
    const label = sl.label === null ? null : sl.label.trim() || null;
    if (label !== null && label.length > 40) return bad('label');
    const ids = new Set<string>();
    const content: MockSlotContent[] = [];
    for (const c of sl.content) {
      const m = mockContentMeta(c.content_id);
      if (!m || m.kind === 'resource' || m.cohort_id !== i.cohort_id || ids.has(c.content_id)) return bad('content');
      ids.add(c.content_id);
      if (c.notify !== 'slot_end' && c.notify !== 'at' && c.notify !== 'none') return bad('notify');
      if (c.notify === 'at') {
        const t = c.notify_at === null ? NaN : Date.parse(c.notify_at);
        if (Number.isNaN(t) || t < Date.parse(instant(i.date, sl.start_time))) return bad('notify');
        content.push({ content_id: c.content_id, notify: 'at', notify_at: new Date(t).toISOString(), notified: false });
      } else {
        if (c.notify_at !== null) return bad('notify');
        content.push({ content_id: c.content_id, notify: c.notify, notify_at: null, notified: false });
      }
    }
    slots.push({ label, start_time: sl.start_time, end_time: sl.end_time, group_nos: asc(groups), content });
  }
  slots.sort((a, b) => a.start_time.localeCompare(b.start_time) || a.end_time.localeCompare(b.end_time));
  const deliverables = i.deliverables.map((d) => d.trim()).filter(Boolean);
  if (deliverables.length > 20 || deliverables.some((d) => d.length > 300)) return bad('deliverables');
  return { deliverables, slots, title };
}

function toMySession(r: MockSessionRow, group: number | null): MySession {
  const s = toSession(r);
  const ownIdx = group === null ? -1 : s.slots.findIndex((x) => x.group_nos.includes(group));
  const own = ownIdx >= 0 ? s.slots[ownIdx]! : null;
  const when = own ?? s;
  const items = own ? slotContent(r.slots[ownIdx]!) : distinctContent(r.slots);
  return {
    id: s.id, date: s.date, start_time: when.start_time, end_time: when.end_time, starts_at: when.starts_at, ends_at: when.ends_at,
    title: s.title, group_nos: s.group_nos,
    slots: s.slots.map((x) => ({ label: x.label, start_time: x.start_time, end_time: x.end_time, group_nos: x.group_nos })),
    deliverables: s.deliverables,
    content: items.map((c) => ({ id: c.id, kind: c.kind, title: c.title, available: mockContentAvailable(c.id) })),
  };
}

let tplSeq = 0;
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

function checkTemplate(i: ClassTemplateInput): { name: string; slots: MockTemplate['slots'] } | { field: string } {
  const name = i.name.trim();
  if (!name || name.length > 80) return bad('name');
  if (!Array.isArray(i.slots) || i.slots.length < 1 || i.slots.length > 6) return bad('slots');
  const slots: MockTemplate['slots'] = [];
  for (const x of i.slots) {
    const label = x.label.trim();
    if (!label || label.length > 40) return bad('label');
    if (!HH_MM.test(x.start_time) || !HH_MM.test(x.end_time) || x.start_time >= x.end_time) return bad('time');
    slots.push({ label, start_time: x.start_time, end_time: x.end_time });
  }
  return { name, slots };
}

const toTemplate = (t: MockTemplate): ClassTemplate => ({
  id: t.id, name: t.name, slots: t.slots.map((x) => ({ ...x })), updated_at: t.updated_at,
  used_count: sessionRows().filter((r) => r.template_id === t.id).length,
});

export const mockSessions: S14Api = {
  async adminListClassSessions(cohortId) {
    const err = requireAdmin();
    if (err) return fail(err);
    ensureFixtureLinks();
    if (!cohortOf(cohortId)) return fail('not_found');
    return ok(sessionRows().filter((r) => r.cohort_id === cohortId).sort(byStart).map(toSession));
  },

  async adminUpsertClassSession(input) {
    const err = requireAdmin();
    if (err) return fail(err);
    ensureFixtureLinks();
    const cohort = cohortOf(input.cohort_id);
    if (!cohort) return fail('not_found');
    const rows = sessionRows();
    const existing = input.id === null ? null : rows.find((r) => r.id === input.id);
    if (input.id !== null && !existing) return fail('not_found');
    if (existing && existing.cohort_id !== input.cohort_id) return fail('invalid_input');
    const v = validate(input);
    if ('field' in v) return fail('invalid_input', v.field);
    if (cohort.status === 'archived') return fail('cohort_archived');
    const fields = {
      date: input.date, title: v.title, slots: v.slots, deliverables: v.deliverables,
      lab_block_until: input.lab_block_until, template_id: input.template_id,
    };
    if (existing) {
      Object.assign(existing, fields);
      return ok(toSession(existing));
    }
    const row: MockSessionRow = {
      id: newId(), cohort_id: input.cohort_id, ...fields,
      created_at: new Date().toISOString(),
    };
    rows.push(row);
    return ok(toSession(row));
  },

  async adminDeleteClassSession(id) {
    const err = requireAdmin();
    if (err) return fail(err);
    const rows = sessionRows();
    const idx = rows.findIndex((r) => r.id === id);
    if (idx < 0) return fail('not_found');
    if (cohortOf(rows[idx]!.cohort_id)?.status === 'archived') return fail('cohort_archived');
    rows.splice(idx, 1);
    return ok({ ok: true as const });
  },

  async adminListClassTemplates() {
    const err = requireAdmin();
    if (err) return fail(err);
    return ok([...templateRows()].sort((a, b) => a.name.localeCompare(b.name)).map(toTemplate));
  },

  async adminUpsertClassTemplate(input) {
    const err = requireAdmin();
    if (err) return fail(err);
    const list = templateRows();
    const existing = input.id === null ? null : list.find((t) => t.id === input.id);
    if (input.id !== null && !existing) return fail('not_found');
    const v = checkTemplate(input);
    if ('field' in v) return fail('invalid_input', v.field);
    if (list.some((t) => t.id !== input.id && t.name.toLowerCase() === v.name.toLowerCase())) return fail('conflict');
    const now = new Date().toISOString();
    if (existing) {
      Object.assign(existing, { name: v.name, slots: v.slots, updated_at: now });
      return ok(toTemplate(existing));
    }
    let id: string;
    do id = `00000000-0000-4000-8000-0000000024${String(10 + ++tplSeq).padStart(2, '0')}`;
    while (list.some((x) => x.id === id));
    const t: MockTemplate = { id, name: v.name, slots: v.slots, updated_at: now };
    list.push(t);
    return ok(toTemplate(t));
  },

  async adminDeleteClassTemplate(id) {
    const err = requireAdmin();
    if (err) return fail(err);
    const list = templateRows();
    const idx = list.findIndex((t) => t.id === id);
    if (idx < 0) return fail('not_found');
    list.splice(idx, 1);
    for (const r of sessionRows()) if (r.template_id === id) r.template_id = null;
    return ok({ ok: true as const });
  },

  async getMySessions(cohortId) {
    const u = currentUser();
    if (!u) return fail('not_authenticated');
    ensureFixtureLinks();
    const e = seedEnrolments().find((x) => x.user_id === u.profile.id && x.cohort_id === cohortId && x.status === 'active');
    if (!e) return fail('forbidden');
    const group = e.role === 'student' ? mockGroupOf(e.id).group_no : null;
    const slotOf = (r: MockSessionRow) => (group === null ? null : r.slots.find((x) => x.group_nos.includes(group)) ?? null);
    const mine = sessionRows()
      .filter((r) => r.cohort_id === cohortId && (e.role !== 'student' || slotOf(r) !== null))
      .map((r) => {
        const m = toMySession(r, group);
        return { m, start: Date.parse(m.starts_at), end: Date.parse(m.ends_at) };
      })
      .sort((a, b) => a.start - b.start);
    const now = Date.now();
    const upcoming = mine.filter((x) => x.end > now).slice(0, 10).map((x) => x.m);
    const recent = mine.filter((x) => x.end <= now).reverse().slice(0, 5).map((x) => x.m);
    return ok<MySessions>({ next: upcoming[0] ?? null, upcoming, recent });
  },
};
