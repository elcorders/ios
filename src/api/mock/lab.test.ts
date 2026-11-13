import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../index';
import { resetMockAuth } from './auth';
import { MOCK_ARCHIVED_COHORT, MOCK_COHORT } from './fixtures/s1';
import { mockSetBookingStatus } from './lab';
import { mockSetGroup } from './survey';
import { resetMockSessions, setSessionRows, type MockSessionRow } from './sessionStore';
import { labLevel } from './lab';

// Monday 2026-11-09 10:00 Colombo: cycle 1 (2026-11-07 .. 2026-11-20).
const NOW = new Date('2026-11-09T10:00:00+05:30');
const C = MOCK_COHORT.id;
const slot = (date: string, hour: number) => `${date}T${String(hour).padStart(2, '0')}:00:00+05:30`;
const signIn = (n: number) => api.verifyEmailCode(`student${String(n).padStart(3, '0')}@example.edu`, '123456');
const myLab = async () => {
  const r = await api.getMyLab(C);
  if (!r.ok) throw new Error(r.error.code);
  return r.data;
};
const code = <T,>(r: { ok: boolean; error?: { code: string } } & Partial<{ data: T }>) => (r.ok ? 'ok' : r.error!.code);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  resetMockAuth();
  setSessionRows([]);
});
afterEach(() => {
  vi.useRealTimers();
  resetMockSessions();
});

const session = (date: string, until: string | null): MockSessionRow => ({
  id: `s-${date}-${until}`, cohort_id: C, date, title: 'Fictional class',
      slots: [{ start_time: '09:00', end_time: '12:00', group_nos: [1] }], deliverables: [], lab_block_until: until, content_ids: [], created_at: '2026-11-01T09:00:00+05:30',
});

describe('mock lab calendar', () => {
  it('lists Colombo slots, capacity, closures and seats taken (staff numbers)', async () => {
    await api.verifyEmailCode('instructor001@example.edu', '123456');
    const r = await api.getLabCalendar('2026-11-09', '2026-11-16');
    if (!r.ok) throw new Error();
    expect(r.data.capacity).toBe(12); // 13 Macs, one out of service
    const days = new Map(r.data.days.map((d) => [d.date, d]));
    expect(days.get('2026-11-09')!.slots.map((s) => s.start.slice(11, 16))).toEqual(
      ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'],
    );
    expect(days.get('2026-11-09')!.slots[0]!.end).toBe(slot('2026-11-09', 10));
    expect(days.get('2026-11-15')).toMatchObject({ open: false, slots: [], closure: null }); // Sunday
    expect(days.get('2026-11-12')).toMatchObject({ open: false, closure: { kind: 'class_day' } });
    expect(days.get('2026-11-14')).toMatchObject({ open: false, closure: { kind: 'holiday' } });
    const tue = days.get('2026-11-10')!;
    expect(tue.slots.find((s) => s.start === slot('2026-11-10', 10))).toMatchObject({ booked: 12, full: true });
    expect(tue.slots.find((s) => s.start === slot('2026-11-10', 14))).toMatchObject({ booked: 5, full: false });
  });

  it('computes levels at the thresholds', () => {
    expect([labLevel(0, 12), labLevel(5, 12), labLevel(6, 12), labLevel(9, 12), labLevel(10, 12), labLevel(11, 12), labLevel(12, 12), labLevel(0, 0)])
      .toEqual(['quiet', 'quiet', 'filling', 'filling', 'almost_full', 'almost_full', 'full', 'full']);
  });

  it('hides numbers from students and shows levels', async () => {
    await signIn(5);
    const r = await api.getLabCalendar('2026-11-10', '2026-11-10');
    if (!r.ok) throw new Error();
    expect(r.data.capacity).toBeNull();
    const d = r.data.days[0]!;
    expect(d).toMatchObject({ booked: null, slot_capacity: null, level: 'quiet' });
    expect(d.slots.find((s) => s.start === slot('2026-11-10', 10))).toMatchObject({ booked: null, level: 'full', full: true, blocked: false });
    expect(d.slots.find((s) => s.start === slot('2026-11-10', 14))).toMatchObject({ booked: null, level: 'quiet' });
  });

  it('blocks slots before the session block and sums only unblocked slots', async () => {
    setSessionRows([session('2026-11-10', '13:30'), session('2026-11-11', '24:00')]);
    await api.verifyEmailCode('admin@example.edu', '123456');
    const r = await api.getLabCalendar('2026-11-10', '2026-11-11');
    if (!r.ok) throw new Error();
    const [tue, wed] = r.data.days;
    expect(tue!.block_until).toBe('13:30');
    expect(tue!.slots.filter((s) => s.blocked).map((s) => s.start.slice(11, 13))).toEqual(['09', '10', '11', '12', '13']);
    expect(tue!.slots.find((s) => s.blocked)).toMatchObject({ level: null, full: false });
    expect(tue!.slot_capacity).toBe(12 * 5);
    expect(wed).toMatchObject({ block_until: '24:00', level: null, booked: 0, slot_capacity: 0 });
    await signIn(5);
    const res = await api.bookSlots(C, [slot('2026-11-10', 12)]);
    expect(res.ok ? 'ok' : res.error.code).toBe('slot_closed');
    expect(code(await api.bookSlots(C, [slot('2026-11-10', 14)]))).toBe('ok');
  });

  it('rejects a bad range and signed-out callers', async () => {
    expect(code(await api.getLabCalendar('2026-11-09', '2026-11-10'))).toBe('not_authenticated');
    await signIn(5);
    expect(code(await api.getLabCalendar('2026-11-10', '2026-11-09'))).toBe('invalid_input');
    expect(code(await api.getLabCalendar('2026-11-01', '2027-01-01'))).toBe('invalid_input');
  });
});

describe('mock lab eligibility and cycle', () => {
  it('maps the survey answer to the reason', async () => {
    await signIn(1);
    expect(await myLab()).toMatchObject({ eligible: false, reason: 'has_mac' });
    await signIn(5);
    const lab = await myLab();
    expect(lab).toMatchObject({ eligible: true, reason: null, horizon_end: '2026-11-23' });
    expect(lab.cycle).toEqual({ no: 1, start: '2026-11-07', end: '2026-11-20' });
    expect(lab.credits).toEqual({ allowance: 20, used: 0, remaining: 20, penalty: 0 });
    expect(lab.week).toEqual({ start: '2026-11-07', end: '2026-11-13', hours: 0, cap: 10 });
    expect(lab.macs).toHaveLength(12);
    await signIn(4); // no survey answer
    expect(await myLab()).toMatchObject({ eligible: false, reason: 'no_survey' });
  });

  it('refuses bookings when not eligible', async () => {
    await signIn(1);
    expect(code(await api.bookSlots(C, [slot('2026-11-10', 15)]))).toBe('not_eligible');
    await signIn(4);
    expect(code(await api.bookSlots(C, [slot('2026-11-10', 15)]))).toBe('not_eligible');
  });

  it('keeps an existing booking visible and withdrawable for a student with a Mac', async () => {
    await signIn(1);
    const lab = await myLab();
    expect(lab.bookings).toHaveLength(1);
    const w = await api.withdrawBooking(lab.bookings[0]!.id);
    expect(w.ok && w.data.status).toBe('withdrawn');
  });
});

describe('mock lab booking', () => {
  beforeEach(async () => {
    await signIn(5);
  });

  it('books, charges a credit and counts the week hours', async () => {
    const r = await api.bookSlots(C, [slot('2026-11-10', 15), slot('2026-11-11', 9)]);
    if (!r.ok) throw new Error(r.error.code);
    expect(r.data.bookings).toHaveLength(2);
    expect(r.data.warnings).toEqual([]);
    const lab = await myLab();
    expect(lab.credits).toEqual({ allowance: 20, used: 2, remaining: 18, penalty: 0 });
    expect(lab.week.hours).toBe(2);
    expect(lab.needs_preferred_mac).toBe(true);
    const cal = await api.getLabCalendar('2026-11-10', '2026-11-10');
    expect(cal.ok && cal.data.days[0]!.slots.find((s) => s.start === slot('2026-11-10', 15))).toMatchObject({ booked: null, level: 'quiet' });
  });

  it('maps every error code with a slot_start hint', async () => {
    const hint = (r: Awaited<ReturnType<typeof api.bookSlots>>) => (r.ok ? null : r.error.details);
    const past = await api.bookSlots(C, [slot('2026-11-09', 10)]);
    expect(code(past)).toBe('slot_past');
    expect(hint(past)).toEqual({ slot_start: slot('2026-11-09', 10) });
    expect(code(await api.bookSlots(C, [slot('2026-11-24', 10)]))).toBe('beyond_horizon');
    expect(code(await api.bookSlots(C, [slot('2026-11-12', 10)]))).toBe('slot_closed'); // class day
    expect(code(await api.bookSlots(C, [slot('2026-11-15', 10)]))).toBe('slot_closed'); // Sunday
    expect(code(await api.bookSlots(C, [slot('2026-11-10', 19)]))).toBe('slot_closed'); // after hours
    expect(code(await api.bookSlots(C, [slot('2026-11-10', 10)]))).toBe('slot_full');
    expect(code(await api.bookSlots(C, []))).toBe('invalid_input');
    expect(code(await api.bookSlots(C, ['2026-11-10T10:30:00+05:30']))).toBe('invalid_input');
    expect(code(await api.bookSlots(C, [slot('2026-11-10', 15), slot('2026-11-10', 15)]))).toBe('invalid_input');
    await signIn(2);
    expect(code(await api.bookSlots(MOCK_ARCHIVED_COHORT.id, [slot('2026-11-10', 15)]))).toBe('cohort_archived');
    await signIn(5);
    expect(code(await api.bookSlots(C, [slot('2026-11-10', 15)]))).toBe('ok');
    expect(code(await api.bookSlots(C, [slot('2026-11-10', 15)]))).toBe('already_booked');
  });

  it('is all or nothing', async () => {
    const r = await api.bookSlots(C, [slot('2026-11-10', 15), slot('2026-11-10', 10)]);
    expect(code(r)).toBe('slot_full');
    expect((await myLab()).bookings).toHaveLength(0);
  });

  it('enforces the weekly cap of 10 hours (Sat-Fri weeks)', async () => {
    const ten = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18].map((h) => slot('2026-11-11', h)); // Wed
    const eleven = [...ten.map((s) => s.replace('11-11', '11-17')), slot('2026-11-18', 9)];
    expect(code(await api.bookSlots(C, eleven))).toBe('weekly_cap'); // 11 in one week, all or nothing
    expect(code(await api.bookSlots(C, ten))).toBe('ok');
    expect(code(await api.bookSlots(C, [slot('2026-11-13', 9)]))).toBe('weekly_cap'); // Fri, same week
    expect(code(await api.bookSlots(C, [slot('2026-11-16', 9)]))).toBe('ok'); // next week
  });

  it('allows up to 13 slots per request and rejects 14', async () => {
    const fourteen = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18].map((h) => slot('2026-11-16', h));
    fourteen.push(slot('2026-11-17', 9), slot('2026-11-17', 10), slot('2026-11-17', 11), slot('2026-11-17', 12));
    expect(code(await api.bookSlots(C, fourteen))).toBe('invalid_input');
    expect(code(await api.bookSlots(C, fourteen.slice(0, 13)))).toBe('weekly_cap'); // 13 accepted by the count rule; 10 h cap trips
    expect(code(await api.bookSlots(C, [...fourteen.slice(0, 7), ...fourteen.slice(10, 13)]))).toBe('ok');
  });

  it('runs out of credits (20 per cycle) and returns them on withdraw', async () => {
    for (const d of ['2026-11-10', '2026-11-11', '2026-11-16', '2026-11-17']) {
      // 5 hours on each of four days, two days per week
      expect(code(await api.bookSlots(C, [9, 11, 12, 13, 15].map((h) => slot(d, h))))).toBe('ok');
    }
    const lab = await myLab();
    expect(lab.credits.remaining).toBe(0);
    const r = await api.bookSlots(C, [slot('2026-11-18', 9)]);
    expect(code(r)).toBe('no_credits');
    expect(r.ok ? null : r.error.details).toEqual({ slot_start: slot('2026-11-18', 9) });
    const first = lab.bookings[0]!;
    expect(code(await api.withdrawBooking(first.id))).toBe('ok');
    expect((await myLab()).credits.remaining).toBe(1);
    expect(code(await api.bookSlots(C, [slot('2026-11-10', 16)]))).toBe('ok');
  });

  it('charges the cycle a slot falls in', async () => {
    expect(code(await api.bookSlots(C, [slot('2026-11-23', 9)]))).toBe('ok'); // cycle 2 starts 2026-11-21
    const lab = await myLab();
    expect(lab.credits.used).toBe(0);
  });

  it('withdraws before the start only, and only own booked bookings', async () => {
    const r = await api.bookSlots(C, [slot('2026-11-10', 15)]);
    const id = r.ok ? r.data.bookings[0]!.id : '';
    expect(code(await api.withdrawBooking(id))).toBe('ok');
    expect(code(await api.withdrawBooking(id))).toBe('conflict');
    expect(code(await api.withdrawBooking('nope'))).toBe('not_found');
    const r2 = await api.bookSlots(C, [slot('2026-11-09', 18)]);
    const id2 = r2.ok ? r2.data.bookings[0]!.id : '';
    vi.setSystemTime(new Date('2026-11-09T18:30:00+05:30'));
    expect(code(await api.withdrawBooking(id2))).toBe('too_late');
    await signIn(1);
    expect(code(await api.withdrawBooking(id2))).toBe('not_found');
  });

  it('suspends after 3 no-shows until an admin clears it', async () => {
    const ids: string[] = [];
    for (const h of [9, 11, 12]) {
      const r = await api.bookSlots(C, [slot('2026-11-10', h)]);
      ids.push(r.ok ? r.data.bookings[0]!.id : '');
    }
    ids.forEach((id) => mockSetBookingStatus(id, 'no_show'));
    expect(await myLab()).toMatchObject({ eligible: false, reason: 'suspended', no_shows: 3, suspended: true });
    expect(code(await api.bookSlots(C, [slot('2026-11-11', 9)]))).toBe('suspended');
    expect((await myLab()).credits.penalty).toBe(6);
    const enrolmentId = `enrol-00000000-0000-4000-8000-000000000105`;
    vi.setSystemTime(new Date('2026-11-11T08:00:00+05:30')); // after the missed slots
    await api.verifyEmailCode('admin@example.edu', '123456');
    expect(code(await api.adminClearSuspension(enrolmentId))).toBe('ok');
    expect(code(await api.adminClearSuspension(enrolmentId))).toBe('conflict');
    await signIn(5);
    const after = await myLab();
    expect(after.eligible).toBe(true);
    expect(after.credits.penalty).toBe(6); // clearing does not remove the penalty
  });

  it('caps the penalty at 75 percent and resets it when a later booking is attended', async () => {
    const ids: string[] = [];
    for (const h of [9, 10, 11, 12, 13, 14, 15, 16, 17]) {
      const r = await api.bookSlots(C, [slot('2026-11-11', h)]);
      ids.push(r.ok ? r.data.bookings[0]!.id : '');
    }
    ids.slice(0, 8).forEach((id) => mockSetBookingStatus(id, 'no_show'));
    mockSetBookingStatus(ids[8]!, 'completed');
    expect(await myLab()).toMatchObject({ no_shows: 0, credits: { penalty: 0 } });
    mockSetBookingStatus(ids[8]!, 'booked');
    const lab = await myLab();
    expect(lab.no_shows).toBe(8);
    expect(lab.credits).toMatchObject({ penalty: 15, allowance: 5 }); // 8 x 2 = 16, capped at floor(20 x 75 / 100)
  });
});

describe('mock lab preferred Mac', () => {
  it('warns on overlap with suggestions, and validates the Mac', async () => {
    await signIn(5);
    const lab = await myLab();
    const mac3 = lab.macs.find((m) => m.no === 3)!;
    expect(await api.setPreferredMac(C, mac3.id)).toEqual({ ok: true, data: { preferred_mac_id: mac3.id, preferred_mac_no: 3 } });
    const r = await api.bookSlots(C, [slot('2026-11-10', 11)]); // a filler prefers Mac 3 here
    if (!r.ok) throw new Error(r.error.code);
    expect(r.data.bookings[0]!.preferred_mac_no).toBe(3);
    expect(r.data.warnings).toHaveLength(1);
    const w = r.data.warnings[0]!;
    expect(w.code).toBe('preferred_mac_overlap');
    expect(w.suggestions.length).toBeGreaterThan(0);
    expect(w.suggestions.length).toBeLessThanOrEqual(5);
    expect(w.suggestions).not.toContain(slot('2026-11-10', 11));
    expect(w.suggestions).not.toContain(slot('2026-11-10', 10)); // full
    expect((await myLab()).needs_preferred_mac).toBe(false);
    expect(await api.setPreferredMac(C, null)).toEqual({ ok: true, data: { preferred_mac_id: null, preferred_mac_no: null } });
    expect(code(await api.setPreferredMac(C, 'nope'))).toBe('not_found');
    await api.verifyEmailCode('admin@example.edu', '123456');
    const macs = await api.adminListMacs();
    const out = macs.ok ? macs.data.find((m) => m.status === 'out_of_service')! : null;
    await signIn(5);
    expect(code(await api.setPreferredMac(C, out!.id))).toBe('not_found');
  });
});

describe('mock lab admin', () => {
  it('requires admin for Macs and hours; reads are open to members', async () => {
    await signIn(5);
    expect(code(await api.adminListMacs())).toBe('ok');
    expect(code(await api.getLabHours())).toBe('ok');
    expect(code(await api.adminUpsertMac({ id: null, no: 20, label: null, status: 'in_service', notes: null }))).toBe('forbidden');
    expect(code(await api.adminSetLabHours([]))).toBe('forbidden');
    expect(code(await api.adminLabCredits(C))).toBe('forbidden');
    expect(code(await api.adminListLabBookings('2026-11-09', '2026-11-10'))).toBe('forbidden');
    expect(code(await api.adminAdjustCredits('x', 1, 'r'))).toBe('forbidden');
  });

  it('manages Macs and capacity follows', async () => {
    await api.verifyEmailCode('admin@example.edu', '123456');
    const list = await api.adminListMacs();
    expect(list.ok && list.data).toHaveLength(13);
    expect(code(await api.adminUpsertMac({ id: null, no: 5, label: null, status: 'in_service', notes: null }))).toBe('conflict');
    expect(code(await api.adminUpsertMac({ id: null, no: 0, label: null, status: 'in_service', notes: null }))).toBe('invalid_input');
    const added = await api.adminUpsertMac({ id: null, no: 14, label: ' Lab 14 ', status: 'in_service', notes: null });
    expect(added.ok && added.data.label).toBe('Lab 14');
    const cal1 = await api.getLabCalendar('2026-11-10', '2026-11-10');
    expect(cal1.ok && cal1.data.capacity).toBe(13);
    if (!added.ok) throw new Error();
    await api.adminUpsertMac({ ...added.data, status: 'out_of_service' });
    const cal2 = await api.getLabCalendar('2026-11-10', '2026-11-10');
    expect(cal2.ok && cal2.data.capacity).toBe(12);
  });

  it('replaces lab hours and validates them', async () => {
    await api.verifyEmailCode('admin@example.edu', '123456');
    const cur = await api.getLabHours();
    expect(cur.ok && cur.data).toHaveLength(6);
    expect(code(await api.adminSetLabHours([{ weekday: 1, open_time: '10:00', close_time: '09:00' }]))).toBe('invalid_input');
    expect(code(await api.adminSetLabHours([{ weekday: 8, open_time: '09:00', close_time: '10:00' }]))).toBe('invalid_input');
    const set = await api.adminSetLabHours([{ weekday: 7, open_time: '10:00', close_time: '12:00' }]);
    expect(set.ok && set.data).toHaveLength(1);
    const cal = await api.getLabCalendar('2026-11-15', '2026-11-16');
    expect(cal.ok && cal.data.days.map((d) => [d.date, d.slots.length])).toEqual([['2026-11-15', 2], ['2026-11-16', 0]]);
  });

  it('keeps closures unique per date and kind; instructors only manage closed days', async () => {
    await api.verifyEmailCode('instructor001@example.edu', '123456');
    expect(code(await api.adminAddClosures([{ date: '2026-11-12', kind: 'holiday', reason: null }]))).toBe('forbidden');
    const add = await api.adminAddClosures([
      { date: '2026-11-10', kind: 'closed', reason: 'Fictional closure' },
      { date: '2026-11-10', kind: 'closed', reason: 'Updated reason' },
    ]);
    expect(add).toEqual({ ok: true, data: { added: 1, updated: 1, withdrawn: 18 } });
    expect(code(await api.adminAddClosures([{ date: 'bad', kind: 'closed', reason: null }]))).toBe('invalid_input');
    const list = await api.listClosures('2026-11-09', '2026-11-30');
    if (!list.ok) throw new Error();
    const tue = list.data.find((c) => c.date === '2026-11-10')!;
    expect(tue.reason).toBe('Updated reason');
    const classDay = list.data.find((c) => c.date === '2026-11-12')!;
    expect(code(await api.adminDeleteClosure(classDay.id))).toBe('forbidden');
    await signIn(5);
    expect(code(await api.bookSlots(C, [slot('2026-11-10', 15)]))).toBe('slot_closed');
    await api.verifyEmailCode('instructor001@example.edu', '123456');
    expect(code(await api.adminDeleteClosure(tue.id))).toBe('ok');
    expect(code(await api.adminDeleteClosure(tue.id))).toBe('not_found');

    await api.verifyEmailCode('admin@example.edu', '123456');
    expect(await api.adminAddClosures([{ date: '2026-11-12', kind: 'holiday', reason: 'Both' }])).toEqual({ ok: true, data: { added: 1, updated: 0, withdrawn: 0 } });
    const both = await api.listClosures('2026-11-12', '2026-11-12');
    expect(both.ok && both.data.map((c) => c.kind).sort()).toEqual(['class_day', 'holiday']);
    await signIn(5);
    expect(code(await api.adminAddClosures([{ date: '2026-11-20', kind: 'closed', reason: null }]))).toBe('forbidden');
  });

  it('lists bookings with names for admin and instructor', async () => {
    await api.verifyEmailCode('instructor001@example.edu', '123456');
    const r = await api.adminListLabBookings('2026-11-10', '2026-11-10');
    if (!r.ok) throw new Error();
    expect(r.data.length).toBeGreaterThanOrEqual(12);
    expect(r.data.every((x) => x.email.endsWith('@example.edu'))).toBe(true);
    expect(r.data.map((x) => x.slot_start)).toEqual([...r.data.map((x) => x.slot_start)].sort());
  });

  it('lists credits and adjusts the current cycle', async () => {
    await api.verifyEmailCode('admin@example.edu', '123456');
    const list = await api.adminLabCredits(C);
    if (!list.ok) throw new Error();
    const s5 = list.data.find((r) => r.email === 'student005@example.edu')!;
    expect(s5).toMatchObject({ eligible: true, allowance: 20, used: 0, remaining: 20, suspended: false });
    expect(list.data.find((r) => r.email === 'student001@example.edu')).toMatchObject({ eligible: false, used: 1, upcoming: 1 });
    expect(code(await api.adminAdjustCredits(s5.enrolment_id, 0, 'x'))).toBe('invalid_input');
    expect(code(await api.adminAdjustCredits(s5.enrolment_id, 5, ' '))).toBe('invalid_input');
    expect(code(await api.adminAdjustCredits('nope', 5, 'x'))).toBe('not_found');
    expect(await api.adminAdjustCredits(s5.enrolment_id, 5, 'Extra project hours')).toEqual({
      ok: true, data: { allowance: 25, used: 0, remaining: 25 },
    });
    mockSetGroup(s5.enrolment_id, 2);
  });
});

describe('mock lab switch (lab_open)', () => {
  const setOpen = async (open: boolean) => {
    await api.verifyEmailCode('admin@example.edu', '123456');
    return api.adminUpdateCohortSettings(C, { lab_open: open });
  };

  it('is open by default and carried on getMe', async () => {
    await signIn(5);
    const me = await api.getMe();
    expect(me.ok && me.data.enrolments[0]?.lab_open).toBe(true);
  });

  it('rejects a non-boolean value', async () => {
    await api.verifyEmailCode('admin@example.edu', '123456');
    const r = await api.adminUpdateCohortSettings(C, { lab_open: 'yes' as unknown as boolean });
    expect(code(r)).toBe('invalid_input');
  });

  it('closed: reason lab_closed wins over survey reasons, booking refused, credits not eligible', async () => {
    expect((await setOpen(false)).ok).toBe(true);
    for (const n of [1, 4, 5]) {
      await signIn(n);
      expect(await myLab()).toMatchObject({ eligible: false, reason: 'lab_closed' });
      expect(code(await api.bookSlots(C, [slot('2026-11-10', 15)]))).toBe('lab_closed');
    }
    const me = await api.getMe();
    expect(me.ok && me.data.enrolments[0]?.lab_open).toBe(false);
    await api.verifyEmailCode('admin@example.edu', '123456');
    const credits = await api.adminLabCredits(C);
    expect(credits.ok && credits.data.every((r) => !r.eligible)).toBe(true);
  });

  it('closed: an earlier booking can still be withdrawn', async () => {
    await setOpen(false);
    await signIn(1);
    const lab = await myLab();
    const w = await api.withdrawBooking(lab.bookings[0]!.id);
    expect(w.ok).toBe(true);
  });

  it('reopens', async () => {
    await setOpen(false);
    await setOpen(true);
    await signIn(5);
    expect(await myLab()).toMatchObject({ eligible: true, reason: null });
  });
});

describe('mock closure ranges', () => {
  it('adds a range, updates existing rows and deletes the whole range', async () => {
    await api.verifyEmailCode('admin@example.edu', '123456');
    const add = await api.adminAddClosureRange({ from: '2026-11-16', to: '2026-11-18', kind: 'closed', reason: ' Fictional ' });
    if (!add.ok) throw new Error();
    expect(add.data).toMatchObject({ added: 3, updated: 0 });
    const again = await api.adminAddClosureRange({ from: '2026-11-18', to: '2026-11-19', kind: 'closed', reason: null });
    expect(again.ok && again.data).toMatchObject({ added: 1, updated: 1 });
    expect(code(await api.adminAddClosureRange({ from: '2026-11-19', to: '2026-11-18', kind: 'closed', reason: null }))).toBe('invalid_input');
    expect(code(await api.adminAddClosureRange({ from: '2026-01-01', to: '2027-01-02', kind: 'closed', reason: null }))).toBe('invalid_input');
    const list = await api.listClosures('2026-11-16', '2026-11-19');
    if (!list.ok || !again.ok) throw new Error();
    expect(list.data.filter((c) => c.range_id === add.data.range_id)).toHaveLength(2);
    const first = list.data.find((c) => c.date === '2026-11-16')!;
    expect(first.reason).toBe('Fictional');
    const del = await api.adminDeleteClosure(first.id, true);
    expect(del).toEqual({ ok: true, data: { ok: true, deleted: 2 } });
    const left = await api.listClosures('2026-11-16', '2026-11-19');
    expect(left.ok && left.data.map((c) => c.date)).toEqual(['2026-11-18', '2026-11-19']);
  });

  it('applies instructor rules to ranges', async () => {
    await api.verifyEmailCode('instructor001@example.edu', '123456');
    expect(code(await api.adminAddClosureRange({ from: '2026-11-16', to: '2026-11-17', kind: 'holiday', reason: null }))).toBe('forbidden');
    const ok = await api.adminAddClosureRange({ from: '2026-11-16', to: '2026-11-17', kind: 'closed', reason: null });
    expect(ok.ok).toBe(true);
    await signIn(5);
    expect(code(await api.adminAddClosureRange({ from: '2026-11-16', to: '2026-11-17', kind: 'closed', reason: null }))).toBe('forbidden');
  });
});
