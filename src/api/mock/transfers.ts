import type {
  AdminTransferRow, ApiError, GroupStat, MyTransfers, Result, S8Api, TransferDecision, TransferRequest,
} from '../types';
import { getMockCurrentEmail } from './auth';
import { getMockTransfersOpen } from './cohortState';
import { MOCK_ARCHIVED_COHORT, MOCK_COHORT, MOCK_USERS } from './fixtures/s1';
import { MOCK_GROUP_COUNT, mockActiveStudents, mockGroupOf, mockSetGroup } from './survey';

/** S8 mock (CONTRACT.md §S8). Shares group state with the survey mock. Emails are counted, never sent. */

const ok = <T>(data: T): Result<T> => ({ ok: true, data });
const fail = <T>(code: string): Result<T> => ({ ok: false, error: { code, message: code } satisfies ApiError });

interface MockRequest extends TransferRequest {
  enrolment_id: string;
  decided_by_email: string | null;
}

let requests: MockRequest[] = [];
let queuedEmails = 0;
let seq = 0;

const nowIso = () => new Date().toISOString();
const newId = () => `00000000-0000-4000-8000-0000000080${String(++seq).padStart(2, '0')}`;
const enrolOf = (n: number) => {
  const email = `student${String(n).padStart(3, '0')}@example.edu`;
  return `enrol-${MOCK_USERS.find((u) => u.profile.email === email)!.profile.id}`;
};
const otherGroups = (from: number) =>
  Array.from({ length: MOCK_GROUP_COUNT }, (_, i) => i + 1).filter((g) => g !== from);

function seed(): void {
  requests = [];
  queuedEmails = 0;
  seq = 0;
  const base = (n: number, over: Partial<MockRequest>, created: string): MockRequest => {
    const enrolment_id = enrolOf(n);
    const from = mockGroupOf(enrolment_id).group_no!;
    const others = otherGroups(from);
    return {
      id: newId(), cohort_id: MOCK_COHORT.id, enrolment_id, from_no: from, pref1_no: others[0]!, pref2_no: others[1]!,
      reason: 'Fictional reason for testing.', status: 'open', decided_no: null, admin_note: null, closed_by: null,
      created_at: created, decided_at: null, decided_by_email: null, ...over,
    };
  };
  const g1 = mockGroupOf(enrolOf(1)).group_no!;
  const g2 = mockGroupOf(enrolOf(2)).group_no!;
  const g3 = mockGroupOf(enrolOf(3)).group_no!;
  // student001 and student002 want each other's group (a swap pair); student003 a single request; student005 history.
  requests.push(base(1, { pref1_no: g2, pref2_no: otherGroups(g1).find((g) => g !== g2)!, reason: 'I sit with my project partner in that group.' }, '2026-11-08T09:00:00+05:30'));
  requests.push(base(2, { pref1_no: g1, pref2_no: otherGroups(g2).find((g) => g !== g1)!, reason: 'My lab schedule clashes with my current group.' }, '2026-11-08T09:10:00+05:30'));
  requests.push(base(3, { pref1_no: 6, pref2_no: otherGroups(g3).find((g) => g !== 6)!, reason: 'Travel time on my group day.' }, '2026-11-08T09:20:00+05:30'));
  requests.push(base(5, {
    status: 'rejected', admin_note: 'Groups are full this week.', closed_by: null,
    decided_at: '2026-11-07T15:00:00+05:30', decided_by_email: 'admin@example.edu',
  }, '2026-11-07T10:00:00+05:30'));
}
seed();

/** Test helper: restore the seeded transfer requests. */
export function resetMockTransfers(): void {
  seed();
}

/** Test helper: emails the mock would have enqueued. */
export const mockQueuedEmails = (): number => queuedEmails;

const currentUser = () => {
  const email = getMockCurrentEmail();
  return email ? MOCK_USERS.find((u) => u.profile.email === email) : undefined;
};
const isOpen = (cohortId: string) => cohortId === MOCK_COHORT.id && getMockTransfersOpen(cohortId, true);
const groupExists = (no: number) => Number.isInteger(no) && no >= 1 && no <= MOCK_GROUP_COUNT;

function groupStats(cohortId: string): GroupStat[] {
  const stats = Array.from({ length: MOCK_GROUP_COUNT }, (_, i) => ({ no: i + 1, name: `Group ${i + 1}`, size: 0, has_mac: 0, no_mac: 0 }));
  for (const e of mockActiveStudents(cohortId)) {
    const { group_no, has_mac } = mockGroupOf(e.id);
    if (!group_no) continue;
    const g = stats[group_no - 1]!;
    g.size += 1;
    if (has_mac === true) g.has_mac += 1;
    if (has_mac === false) g.no_mac += 1;
  }
  return stats;
}

const strip = ({ enrolment_id: _e, decided_by_email: _d, ...r }: MockRequest): TransferRequest => {
  void _e;
  void _d;
  return { ...r };
};

function adminRow(r: MockRequest): AdminTransferRow {
  const e = mockActiveStudents(r.cohort_id).find((x) => x.id === r.enrolment_id);
  const user = MOCK_USERS.find((u) => `enrol-${u.profile.id}` === r.enrolment_id)!;
  const g = mockGroupOf(r.enrolment_id);
  return {
    ...strip(r), enrolment_id: r.enrolment_id, enrolment_status: e ? 'active' : 'removed', email: user.profile.email,
    index_no: user.profile.index_no, first_name: user.profile.first_name, last_name: user.profile.last_name,
    has_mac: g.has_mac, current_no: g.group_no, decided_by_email: r.decided_by_email,
  };
}

const adminOnly = <T>(): Result<T> | null => {
  const u = currentUser();
  if (!u) return fail('not_authenticated');
  return u.profile.is_admin ? null : fail('forbidden');
};
const validNote = (note: string | null | undefined) => note == null || note.length <= 500;
const decision = (cohortId: string, rows: MockRequest[]): Result<TransferDecision> =>
  ok({ requests: rows.map(adminRow), groups: groupStats(cohortId) });

function approve(r: MockRequest, to: number, note: string | null): void {
  mockSetGroup(r.enrolment_id, to);
  Object.assign(r, {
    status: 'approved', decided_no: to, admin_note: note, decided_at: nowIso(), decided_by_email: currentUser()!.profile.email,
  });
  queuedEmails += 1;
}

export const mockTransfers: S8Api = {
  async getMyTransfers(cohortId) {
    const u = currentUser();
    if (!u) return fail('not_authenticated');
    const e = mockActiveStudents(cohortId).find((x) => x.user_id === u.profile.id);
    if (!e) return fail('forbidden');
    const out: MyTransfers = {
      transfers_open: isOpen(cohortId),
      group_no: mockGroupOf(e.id).group_no,
      groups: Array.from({ length: MOCK_GROUP_COUNT }, (_, i) => ({ no: i + 1, name: `Group ${i + 1}` })),
      requests: requests.filter((r) => r.enrolment_id === e.id).sort((a, b) => b.created_at.localeCompare(a.created_at)).map(strip),
    };
    return ok(out);
  },

  async requestTransfer({ cohortId, pref1No, pref2No, reason }) {
    const u = currentUser();
    if (!u) return fail('not_authenticated');
    const e = mockActiveStudents(cohortId).find((x) => x.user_id === u.profile.id);
    if (!e) return fail('forbidden');
    if (cohortId === MOCK_ARCHIVED_COHORT.id) return fail('cohort_archived');
    if (!isOpen(cohortId)) return fail('transfers_closed');
    const from = mockGroupOf(e.id).group_no;
    if (!from || requests.some((r) => r.enrolment_id === e.id && r.status === 'open')) return fail('conflict');
    const text = (reason ?? '').trim();
    if (!groupExists(pref1No) || !groupExists(pref2No) || pref1No === pref2No || pref1No === from || pref2No === from
      || text.length < 5 || text.length > 500) return fail('invalid_input');
    const dayAgo = Date.now() - 86_400_000;
    if (requests.filter((r) => r.enrolment_id === e.id && Date.parse(r.created_at) > dayAgo).length >= 5) return fail('rate_limited');
    const r: MockRequest = {
      id: newId(), cohort_id: cohortId, enrolment_id: e.id, from_no: from, pref1_no: pref1No, pref2_no: pref2No, reason: text,
      status: 'open', decided_no: null, admin_note: null, closed_by: null, created_at: nowIso(), decided_at: null, decided_by_email: null,
    };
    requests.push(r);
    return ok(strip(r));
  },

  async cancelTransfer(requestId) {
    const u = currentUser();
    if (!u) return fail('not_authenticated');
    const r = requests.find((x) => x.id === requestId && x.enrolment_id === `enrol-${u.profile.id}`);
    if (!r) return fail('not_found');
    if (r.status !== 'open') return fail('conflict');
    Object.assign(r, { status: 'cancelled', closed_by: 'student', decided_at: nowIso() });
    return ok(strip(r));
  },

  async adminListTransfers(cohortId) {
    const denied = adminOnly<never>();
    if (denied) return denied;
    if (cohortId !== MOCK_COHORT.id && cohortId !== MOCK_ARCHIVED_COHORT.id) return fail('not_found');
    return ok({
      transfers_open: isOpen(cohortId),
      groups: groupStats(cohortId),
      requests: requests.filter((r) => r.cohort_id === cohortId).sort((a, b) => a.created_at.localeCompare(b.created_at)).map(adminRow),
      outbox: { queued: 0, failed: 0 },
    });
  },

  async adminDecideTransfer({ requestId, approve: yes, groupNo, note }) {
    const denied = adminOnly<never>();
    if (denied) return denied;
    const r = requests.find((x) => x.id === requestId);
    if (!r) return fail('not_found');
    if (r.status !== 'open') return fail('conflict');
    if (!validNote(note)) return fail('invalid_input');
    if (!yes) {
      Object.assign(r, { status: 'rejected', admin_note: note, decided_at: nowIso(), decided_by_email: currentUser()!.profile.email });
      queuedEmails += 1;
      return decision(r.cohort_id, [r]);
    }
    const row = adminRow(r);
    if (row.enrolment_status !== 'active' || row.current_no !== r.from_no) return fail('conflict');
    if (groupNo == null || !groupExists(groupNo) || groupNo === r.from_no) return fail('invalid_input');
    approve(r, groupNo, note);
    return decision(r.cohort_id, [r]);
  },

  async adminApproveSwap(requestA, requestB, note = null) {
    const denied = adminOnly<never>();
    if (denied) return denied;
    const a = requests.find((x) => x.id === requestA);
    const b = requests.find((x) => x.id === requestB);
    if (!a || !b) return fail('not_found');
    if (a.status !== 'open' || b.status !== 'open') return fail('conflict');
    if (a.cohort_id !== b.cohort_id || a.id === b.id || ![a.pref1_no, a.pref2_no].includes(b.from_no)
      || ![b.pref1_no, b.pref2_no].includes(a.from_no) || !validNote(note)) return fail('invalid_input');
    for (const r of [a, b]) {
      const row = adminRow(r);
      if (row.enrolment_status !== 'active' || row.current_no !== r.from_no) return fail('conflict');
    }
    const [toA, toB] = [b.from_no, a.from_no];
    approve(a, toA, note);
    approve(b, toB, note);
    return decision(a.cohort_id, [a, b]);
  },

  async adminMoveStudent({ enrolmentId, groupNo, note }) {
    const denied = adminOnly<never>();
    if (denied) return denied;
    const e = mockActiveStudents(MOCK_COHORT.id).find((x) => x.id === enrolmentId);
    if (!e) return fail('not_found');
    const from = mockGroupOf(e.id).group_no;
    if (!groupExists(groupNo) || groupNo === from || !validNote(note)) return fail('invalid_input');
    mockSetGroup(e.id, groupNo);
    queuedEmails += 1;
    const closed = requests.filter((r) => r.enrolment_id === e.id && r.status === 'open');
    for (const r of closed) {
      Object.assign(r, {
        status: 'cancelled', closed_by: 'admin', admin_note: note ?? 'Moved manually', decided_at: nowIso(),
        decided_by_email: currentUser()!.profile.email,
      });
    }
    return ok({ requests: closed.map(adminRow), groups: groupStats(MOCK_COHORT.id), from_no: from, to_no: groupNo });
  },

  async adminSendOutbox() {
    const denied = adminOnly<never>();
    if (denied) return denied;
    const skipped = queuedEmails;
    queuedEmails = 0;
    return ok({ sent: 0, failed: 0, skipped, remaining: 0 });
  },
};
