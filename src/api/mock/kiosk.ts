import type {
  ApiError, IsoDateTime, KioskContent, KioskDevice, KioskFeed, KioskLabHour, KioskPerson, KioskSession, Result, S21Api,
} from '../types';
import { demoParam, colomboAt, colomboDate, colomboHM, isWellFormedCode, normaliseCode, shortLabel } from '../../lib/kiosk';
import { getMockCurrentEmail } from './auth';
import { mockContentLinkInfo, mockKioskGetContent, mockKioskItems } from './content';
import { MOCK_ARCHIVED_COHORT, MOCK_COHORT, MOCK_USERS } from './fixtures/s1';
import { mockLabDay } from './lab';
import { sessionRows, type MockSessionRow } from './sessionStore';

/**
 * S21 mock (CONTRACT §S21). In-memory and per browser tab: a kiosk tab and a phone tab do not share state,
 * so the mock approves a pairing on its own a few seconds after it starts (see `setMockAutoApproveMs`).
 * Fictional data only.
 */

const ok = <T>(data: T): Result<T> => ({ ok: true, data });
const fail = <T>(code: string): Result<T> => ({ ok: false, error: { code, message: code } satisfies ApiError });

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const PAIRING_MS = 10 * 60_000;
const HOUR_MS = 3_600_000;
/** A well-formed code that the mock always treats as expired / used (for demos and tests). */
export const MOCK_INVALID_CODE = '00000000';

let autoApproveMs = 10_000;
/** Test helper: how long after start the mock approves a pairing itself. */
export function setMockAutoApproveMs(ms: number): void {
  autoApproveMs = ms;
}

interface Pairing { id: string; code: string; started: number; expires: number; device_id: string | null }
let pairings: Pairing[] = [];
let devices: KioskDevice[] = [];
let signedIn: string | null = null;
let currentKioskCohort: string | null = MOCK_COHORT.id;
let seq = 0;

const iso = (ms: number): IsoDateTime => `${new Date(ms + 19_800_000).toISOString().slice(0, 19)}+05:30`;
const uuid = (n: number) => `00000000-0000-4000-8000-0000000021${String(n).padStart(2, '0')}`;
const pad = (n: number, w: number) => String(n).padStart(w, '0');

function seedDevices(): KioskDevice[] {
  const now = Date.now();
  const base = { cohort_id: null, cohort_code: null, ip_changed: false, paired_by_name: 'Test Admin', created_at: iso(now - 20 * 86_400_000), revoked_at: null };
  return [
    { ...base, id: uuid(1), name: 'Lab 1 wall screen', online: true, last_seen_at: iso(now - 30_000), last_ip: '203.0.113.20', user_agent: 'Mozilla/5.0 (X11; Linux) Chrome/130 (fictional)' },
    { ...base, id: uuid(2), name: 'Staff room PC', cohort_id: MOCK_ARCHIVED_COHORT.id, cohort_code: MOCK_ARCHIVED_COHORT.code, online: false, last_seen_at: iso(now - 3 * 3_600_000), last_ip: '203.0.113.31', ip_changed: true, user_agent: null },
  ];
}
devices = seedDevices();

/** Test helper: restore seeded state. */
export function resetMockKiosk(): void {
  pairings = [];
  devices = seedDevices();
  signedIn = null;
  currentKioskCohort = MOCK_COHORT.id;
  seq = 0;
  autoApproveMs = 10_000;
}

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => CROCKFORD[b % 32]).join('');
}

function newDevice(name: string, cohortId: string | null, by: string): KioskDevice {
  const cohort = cohortId === MOCK_COHORT.id ? MOCK_COHORT : cohortId === MOCK_ARCHIVED_COHORT.id ? MOCK_ARCHIVED_COHORT : null;
  const d: KioskDevice = {
    id: uuid(10 + ++seq), name, cohort_id: cohortId, cohort_code: cohort?.code ?? null, online: false, last_seen_at: null,
    last_ip: null, ip_changed: false, user_agent: null, paired_by_name: by, created_at: iso(Date.now()), revoked_at: null,
  };
  devices.push(d);
  return d;
}
const nameTaken = (name: string) => devices.some((d) => !d.revoked_at && d.name.toLowerCase() === name.toLowerCase());

/** Approve a pairing (used by the lazy auto-approval and the demo button). */
function approve(p: Pairing, name: string, cohortId: string | null, by: string): KioskDevice {
  let n = name;
  for (let i = 2; nameTaken(n); i++) n = `${name} ${i}`;
  const d = newDevice(n, cohortId, by);
  p.device_id = d.id;
  return d;
}

/** Mock-only: approve a pending pairing right now (the "Simulate approval" button). */
export function mockSimulatePairApproval(pairingId: string): void {
  const p = pairings.find((x) => x.id === pairingId);
  if (p && !p.device_id && Date.now() < p.expires) approve(p, 'Demo kiosk', null, 'Test Instructor');
}

const currentUser = () => MOCK_USERS.find((u) => u.profile.email === getMockCurrentEmail()) ?? null;
const isStaff = () => {
  const u = currentUser();
  return !!u && (u.profile.is_admin || u.role === 'instructor');
};
const isAdmin = () => !!currentUser()?.profile.is_admin;

// ───────────── feed ─────────────
const KIND_ORDER = { resource: 0, tutorial: 1, material: 2 } as const;

function linkedContent(ids: string[]): KioskSession['content'] {
  const visible = new Set(mockKioskItems(MOCK_COHORT.id).map((i) => i.id));
  return ids.flatMap((id) => {
    const i = mockContentLinkInfo(id);
    return i ? [{ id, kind: i.kind, title: i.title, available: visible.has(id) }] : [];
  }).sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
}

function toSession(r: MockSessionRow, now: number): KioskSession {
  return {
    id: r.id, title: r.title, date: r.date, deliverables: r.deliverables, content: linkedContent(r.content_ids),
    slots: r.slots.map((s) => ({
      ...s, now: colomboAt(r.date, s.start_time) <= now && now < colomboAt(r.date, s.end_time),
    })),
  };
}

/** A session that is running now: started 40 min ago, ends in 2 h (clamped to today). */
function demoClassNow(now: number): KioskSession {
  const date = colomboDate(now);
  const clamp = (ms: number) => Math.min(Math.max(ms, colomboAt(date, '00:00')), colomboAt(date, '23:59'));
  const start = colomboHM(clamp(now - 40 * 60_000));
  const end = colomboHM(clamp(now + 2 * HOUR_MS));
  const after = colomboHM(clamp(now + 2 * HOUR_MS + 30 * 60_000));
  const last = colomboHM(clamp(now + 5 * HOUR_MS));
  const slots = [{ start_time: start, end_time: end, group_nos: [1, 2, 3], now: true }];
  if (after < last) slots.push({ start_time: after, end_time: last, group_nos: [4, 5, 6], now: false });
  return {
    id: uuid(90), title: 'Tutorial 2 — Layouts (fictional)', date, slots,
    deliverables: ['Tutorial 1 pushed to GitHub', 'Bring a sketch of your app idea', 'Layout exercise committed before you leave'],
    content: linkedContent(['content-t1', 'content-m2', 'content-r1', 'content-m1']),
  };
}

function realNow(now: number): KioskSession | null {
  const r = sessionRows().find((x) => x.cohort_id === MOCK_COHORT.id && toSession(x, now).slots.some((s) => s.now));
  return r ? toSession(r, now) : null;
}

function realNext(now: number): KioskSession | null {
  let best: { t: number; r: MockSessionRow } | null = null;
  for (const r of sessionRows()) {
    if (r.cohort_id !== MOCK_COHORT.id) continue;
    for (const s of r.slots) {
      const t = colomboAt(r.date, s.start_time);
      if (t > now && (!best || t < best.t)) best = { t, r };
    }
  }
  return best ? toSession(best.r, now) : null;
}

function demoNext(now: number): KioskSession {
  const date = colomboDate(now + 86_400_000);
  return {
    id: uuid(91), title: 'Tutorial 2 — Layouts (fictional)', date, deliverables: ['Tutorial 1 pushed to GitHub'], content: linkedContent(['content-m1']),
    slots: [{ start_time: '09:00', end_time: '12:00', group_nos: [1, 2, 3], now: false }, { start_time: '13:00', end_time: '16:00', group_nos: [4, 5, 6], now: false }],
  };
}

const COUNTS = [4, 7, 12, 12, 9, 3, 6, 8, 5, 2];
const indexNo = (n: number) => `COBSCCOMP251P-${pad(n, 3)}`;

/** Fictional bookings across the hours of the day, with a couple of preferred-Mac clashes. */
function demoRows(date: string, openH: number, closeH: number) {
  const out: { slot_ms: number; index_no: string | null; first_name: string; last_name: string; pref: number | null }[] = [];
  for (let h = openH; h < closeH; h++) {
    const hi = h - openH;
    const count = COUNTS[hi % COUNTS.length]!;
    for (let j = 0; j < count; j++) {
      const n = ((hi * 7 + j * 3) % 60) + 1;
      let pref: number | null = j % 5 === 4 ? null : ((hi * 5 + j * 5) % 12) + 1;
      if ((hi === 2 || hi === 6) && j === 1) pref = out.filter((r) => r.slot_ms === colomboAt(date, `${pad(h, 2)}:00`))[0]?.pref ?? pref;
      out.push({ slot_ms: colomboAt(date, `${pad(h, 2)}:00`), index_no: indexNo(n), first_name: `Test${pad(n, 3)}`, last_name: 'Student', pref });
    }
  }
  return out;
}

function labToday(now: number, hours: { open: string; close: string } | null, macs: number, real: ReturnType<typeof mockLabDay>['rows']): KioskLabHour[] {
  if (!hours) return [];
  const date = colomboDate(now);
  const openH = Number(hours.open.slice(0, 2));
  const closeH = Number(hours.close.slice(0, 2));
  const rows = real.length ? real : demoRows(date, openH, closeH);
  const out: KioskLabHour[] = [];
  for (let h = openH; h < closeH; h++) {
    const start = colomboAt(date, `${pad(h, 2)}:00`);
    const mine = rows.filter((r) => r.slot_ms === start);
    const people: KioskPerson[] = mine
      .map((r) => ({
        label: shortLabel(r.index_no, r.first_name, r.last_name),
        preferred_mac_no: r.pref,
        mac_clash: r.pref !== null && mine.filter((o) => o.pref === r.pref).length > 1,
        mac_no: null,
        checked_in: null,
      }))
      .sort((a, b) => (a.preferred_mac_no ?? 99) - (b.preferred_mac_no ?? 99) || a.label.localeCompare(b.label));
    out.push({ start: iso(start), end: iso(start + HOUR_MS), macs, booked: mine.length, people });
  }
  return out;
}

function buildFeed(now: number): KioskFeed {
  const demo = demoParam();
  const day = mockLabDay(colomboDate(now));
  const hours = demo ? { open: '09:00', close: '19:00' } : day.hours;
  const sessionNow = demo === 'class' ? demoClassNow(now) : demo === 'lab' ? null : realNow(now);
  const nextSession = demo === 'lab' ? (realNext(now) ?? demoNext(now)) : realNext(now);
  const content = mockKioskItems(MOCK_COHORT.id);
  const tile = (k: KioskContent['kind']): KioskContent[] => content.filter((c) => c.kind === k);
  const device = devices.find((d) => d.id === signedIn);
  return {
    device: { id: signedIn ?? uuid(1), name: device?.name ?? 'Demo kiosk' },
    cohort: { id: MOCK_COHORT.id, code: MOCK_COHORT.code, batch: MOCK_COHORT.batch },
    now: iso(now),
    lab_hours_today: hours,
    closure_today: demo ? null : day.closure,
    session_now: sessionNow,
    next_session: nextSession,
    lab_today: labToday(now, hours, day.macs, demo ? [] : day.rows),
    content: { resources: tile('resource'), tutorials: tile('tutorial'), materials: tile('material') },
  };
}

// ───────────── API ─────────────
export const mockKiosk: S21Api = {
  async kioskPairStart(publicKey) {
    if (publicKey.kty !== 'EC' || publicKey.crv !== 'P-256' || !publicKey.x || !publicKey.y || 'd' in publicKey) return fail('invalid_input');
    const now = Date.now();
    const p: Pairing = { id: uuid(50 + pairings.length), code: randomCode(), started: now, expires: now + PAIRING_MS, device_id: null };
    pairings.push(p);
    return ok({ pairing_id: p.id, code: p.code, expires_at: iso(p.expires) });
  },

  async kioskPairStatus(pairingId) {
    const p = pairings.find((x) => x.id === pairingId);
    if (!p) return fail('not_found');
    const now = Date.now();
    if (!p.device_id && now - p.started >= autoApproveMs && now < p.expires) approve(p, 'Demo kiosk', null, 'Test Instructor');
    if (p.device_id) return ok({ status: 'approved' as const, device_id: p.device_id });
    return ok({ status: now >= p.expires ? ('expired' as const) : ('pending' as const), device_id: null });
  },

  async kioskSignIn(deviceId, sign) {
    if (!deviceId) return fail('invalid_device');
    const nonce = crypto.getRandomValues(new Uint8Array(32)).reduce((s, b) => s + b.toString(16).padStart(2, '0'), '');
    await sign(new TextEncoder().encode(`nibm-kiosk-v1\n${deviceId}\n${nonce}`));
    const d = devices.find((x) => x.id === deviceId);
    if (d?.revoked_at) return fail('invalid_device');
    signedIn = deviceId;
    return ok({ expires_at: iso(Date.now() + 3_600_000) });
  },

  async kioskSignOut() {
    signedIn = null;
    return ok({ ok: true as const });
  },

  async kioskHeartbeat() {
    if (!signedIn) return fail('forbidden');
    return ok({ ok: true as const, server_time: iso(Date.now()) });
  },

  async kioskFeed() {
    if (!signedIn) return fail('forbidden');
    // ?demo=lab pretends it is 13:20 today so the lab cards show past, current and coming hours.
    const now = demoParam() === 'lab' ? colomboAt(colomboDate(Date.now()), '13:20') + (Date.now() % 60_000) : Date.now();
    return ok(buildFeed(now));
  },

  async kioskGetContent(id) {
    if (!signedIn) return fail('forbidden');
    const item = mockKioskGetContent(id, MOCK_COHORT.id);
    return item ? ok(item) : fail('not_found');
  },

  async kioskPairLookup(code) {
    if (!currentUser()) return fail('not_authenticated');
    if (!isStaff()) return fail('forbidden');
    const c = normaliseCode(code);
    if (!isWellFormedCode(c) || c === MOCK_INVALID_CODE) return fail('invalid_code');
    const p = pairings.find((x) => x.code === c);
    return ok({ status: 'pending' as const, expires_at: iso(p?.expires ?? Date.now() + PAIRING_MS) });
  },

  async kioskPairApprove(code, name, cohortId) {
    if (!currentUser()) return fail('not_authenticated');
    if (!isStaff() || (cohortId && !isAdmin())) return fail('forbidden');
    const c = normaliseCode(code);
    if (!isWellFormedCode(c) || c === MOCK_INVALID_CODE) return fail('invalid_code');
    const n = name.trim();
    if (n.length < 1 || n.length > 60) return fail('invalid_input');
    if (nameTaken(n)) return fail('conflict');
    if (cohortId && cohortId !== MOCK_COHORT.id && cohortId !== MOCK_ARCHIVED_COHORT.id) return fail('not_found');
    if (cohortId === MOCK_ARCHIVED_COHORT.id) return fail('cohort_archived');
    const u = currentUser()!;
    const by = `${u.profile.first_name} ${u.profile.last_name}`;
    const p = pairings.find((x) => x.code === c);
    if (p) return ok(approve(p, n, cohortId ?? null, by));
    return ok(newDevice(n, cohortId ?? null, by));
  },

  async adminListKiosks() {
    if (!isAdmin()) return fail('forbidden');
    const live = devices.filter((d) => !d.revoked_at).sort((a, b) => a.name.localeCompare(b.name));
    const revoked = devices.filter((d) => d.revoked_at);
    return ok({ current_cohort_id: currentKioskCohort, devices: [...live, ...revoked] });
  },

  async adminUpdateKiosk(id, name, cohortId) {
    if (!isAdmin()) return fail('forbidden');
    const d = devices.find((x) => x.id === id);
    if (!d) return fail('not_found');
    const n = name.trim();
    if (n.length < 1 || n.length > 60) return fail('invalid_input');
    if (devices.some((o) => o !== d && !o.revoked_at && o.name.toLowerCase() === n.toLowerCase())) return fail('conflict');
    if (cohortId === MOCK_ARCHIVED_COHORT.id) return fail('cohort_archived');
    d.name = n;
    d.cohort_id = cohortId;
    d.cohort_code = cohortId === MOCK_COHORT.id ? MOCK_COHORT.code : null;
    d.ip_changed = false;
    return ok({ ...d });
  },

  async adminRevokeKiosk(id) {
    if (!isAdmin()) return fail('forbidden');
    const d = devices.find((x) => x.id === id);
    if (!d) return fail('not_found');
    if (d.revoked_at) return fail('conflict');
    d.revoked_at = iso(Date.now());
    d.online = false;
    return ok({ ...d });
  },

  async adminSetKioskCohort(cohortId) {
    if (!isAdmin()) return fail('forbidden');
    if (cohortId === MOCK_ARCHIVED_COHORT.id) return fail('cohort_archived');
    if (cohortId !== null && cohortId !== MOCK_COHORT.id) return fail('not_found');
    currentKioskCohort = cohortId;
    return ok({ current_cohort_id: currentKioskCohort });
  },
};

