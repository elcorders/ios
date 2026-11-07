import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  invoke: vi.fn(),
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  setSession: vi.fn(),
  signOut: vi.fn(),
  from: vi.fn(),
}));

vi.mock('./client', () => ({
  getSupabase: () => ({
    rpc: mocks.rpc,
    functions: { invoke: mocks.invoke },
    auth: {
      signInWithOtp: mocks.signInWithOtp,
      verifyOtp: mocks.verifyOtp,
      setSession: mocks.setSession,
      signOut: mocks.signOut,
    },
    from: mocks.from,
  }),
}));

import { mapFunctionError, mapPostgrestError } from './errors';
import { supabaseApi } from './index';

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
});

function httpError(status: number, body: unknown) {
  return { name: 'FunctionsHttpError', context: new Response(JSON.stringify(body), { status }) };
}

describe('error mapping', () => {
  it('maps P0001 to code/message/details', () => {
    expect(
      mapPostgrestError({ code: 'P0001', message: 'conflict', details: 'Code taken', hint: '{"field":"code"}' }),
    ).toEqual({ code: 'conflict', message: 'Code taken', details: { field: 'code' } });
  });
  it('tolerates a null or invalid hint', () => {
    expect(mapPostgrestError({ code: 'P0001', message: 'forbidden', details: 'No', hint: null })).toEqual({ code: 'forbidden', message: 'No' });
    expect(mapPostgrestError({ code: 'P0001', message: 'forbidden', details: 'No', hint: '{bad' })).toEqual({ code: 'forbidden', message: 'No' });
  });
  it('maps other database errors to internal without leaking text', () => {
    const e = mapPostgrestError({ code: '23505', message: 'duplicate key secret' });
    expect(e.code).toBe('internal');
    expect(e.message).not.toContain('secret');
  });
  it('parses Edge Function error bodies', async () => {
    const e = await mapFunctionError(httpError(400, { error: { code: 'invalid_code', message: 'Bad code', details: null } }));
    expect(e).toEqual({ code: 'invalid_code', message: 'Bad code' });
  });
  it('maps network errors to internal', async () => {
    expect((await mapFunctionError({ name: 'FunctionsFetchError' })).code).toBe('internal');
    expect((await mapFunctionError(httpError(500, 'not json'))).code).toBe('internal');
  });
});

describe('rpc methods', () => {
  it('submitSurvey and adminListSurvey call the S2 RPCs', async () => {
    mocks.rpc.mockResolvedValue({ data: { has_mac: true, submitted_at: 'x', group_no: 2, group_name: 'Group 2' }, error: null });
    const r = await supabaseApi.submitSurvey('c1', true);
    expect(mocks.rpc).toHaveBeenCalledWith('submit_survey', { p_cohort_id: 'c1', p_has_mac: true });
    expect(r.ok && r.data.group_no).toBe(2);
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'cohort_archived', details: 'x', hint: null } });
    const e = await supabaseApi.adminListSurvey('c1');
    expect(mocks.rpc).toHaveBeenCalledWith('admin_list_survey', { p_cohort_id: 'c1' });
    expect(!e.ok && e.error.code).toBe('cohort_archived');
  });
  it('lmsLanding maps params to p_ args', async () => {
    mocks.rpc.mockResolvedValue({ data: { status: 'pending', cohort_code: '25.2', email: 'a@example.edu' }, error: null });
    const r = await supabaseApi.lmsLanding({ key: 'k', course_id: '1', email: 'a@example.edu', first: 'A' });
    expect(mocks.rpc).toHaveBeenCalledWith('lms_landing', {
      p_key: 'k',
      p_course_id: '1',
      p_idnumber: null,
      p_username: null,
      p_email: 'a@example.edu',
      p_first: 'A',
      p_last: null,
    });
    expect(r).toEqual({ ok: true, data: { status: 'pending', cohort_code: '25.2', email: 'a@example.edu' } });
  });
  it('returns mapped errors, never throws', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'invalid_link', details: 'Bad link', hint: null } });
    const r = await supabaseApi.lmsLanding({ key: 'k', course_id: '1', email: 'a@example.edu' });
    expect(r).toEqual({ ok: false, error: { code: 'invalid_link', message: 'Bad link' } });
    mocks.rpc.mockRejectedValue(new TypeError('Failed to fetch'));
    const r2 = await supabaseApi.getMe();
    expect(r2.ok === false && r2.error.code).toBe('internal');
  });
  it('getMe maps a permission error (signed out) to not_authenticated', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied for function get_me' } });
    const r = await supabaseApi.getMe();
    expect(r.ok === false && r.error.code).toBe('not_authenticated');
  });
  it('listMembers sends null role when omitted', async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    await supabaseApi.listMembers('c1');
    expect(mocks.rpc).toHaveBeenCalledWith('admin_list_members', { p_cohort_id: 'c1', p_role: null });
  });
  it('adminSetEnrolmentStatus returns id + status only', async () => {
    mocks.rpc.mockResolvedValue({ data: { id: 'e1', status: 'removed', user_id: 'u' }, error: null });
    expect(await supabaseApi.adminSetEnrolmentStatus('e1', 'removed')).toEqual({ ok: true, data: { id: 'e1', status: 'removed' } });
  });
});

describe('functions', () => {
  it('maps function error JSON', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: httpError(429, { error: { code: 'rate_limited', message: 'Slow down' } }) });
    expect(await supabaseApi.totpVerify('123456')).toEqual({ ok: false, error: { code: 'rate_limited', message: 'Slow down' } });
    expect(mocks.invoke).toHaveBeenCalledWith('totp-verify', { body: { code: '123456' } });
  });
  it('totpLogin sets the session from the returned tokens', async () => {
    mocks.invoke.mockResolvedValue({ data: { access_token: 'a', refresh_token: 'r', expires_at: 1 }, error: null });
    mocks.setSession.mockResolvedValue({ data: {}, error: null });
    const r = await supabaseApi.totpLogin('s@example.edu', '123456');
    expect(mocks.invoke).toHaveBeenCalledWith('totp-login', { body: { email: 's@example.edu', code: '123456' } });
    expect(mocks.setSession).toHaveBeenCalledWith({ access_token: 'a', refresh_token: 'r' });
    expect(r.ok).toBe(true);
  });
  it('totpLogin does not set a session on failure', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: httpError(400, { error: { code: 'invalid_code', message: 'x' } }) });
    const r = await supabaseApi.totpLogin('s@example.edu', '000000');
    expect(r.ok === false && r.error.code).toBe('invalid_code');
    expect(mocks.setSession).not.toHaveBeenCalled();
  });
  it('network failure becomes internal', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: { name: 'FunctionsFetchError' } });
    const r = await supabaseApi.rosterImport({ cohort_id: 'c', role: 'student', dry_run: true, rows: [] });
    expect(r.ok === false && r.error.code).toBe('internal');
  });
});

describe('auth', () => {
  it('sendEmailCode uses shouldCreateUser false', async () => {
    mocks.signInWithOtp.mockResolvedValue({ data: {}, error: null });
    expect((await supabaseApi.sendEmailCode('s@example.edu')).ok).toBe(true);
    expect(mocks.signInWithOtp).toHaveBeenCalledWith({ email: 's@example.edu', options: { shouldCreateUser: false } });
  });
  it.each([
    [{ status: 422, code: 'otp_disabled', message: 'Signups not allowed for otp' }, 'not_on_roster'],
    [{ status: 400, code: 'user_not_found', message: 'x' }, 'not_on_roster'],
    [{ status: 429, code: 'over_email_send_rate_limit', message: 'x' }, 'rate_limited'],
    [{ status: 500, code: 'unexpected_failure', message: 'x' }, 'internal'],
  ])('sendEmailCode maps %j to %s', async (err, code) => {
    mocks.signInWithOtp.mockResolvedValue({ data: {}, error: err });
    const r = await supabaseApi.sendEmailCode('s@example.edu');
    expect(r.ok === false && r.error.code).toBe(code);
  });
  it('verifyEmailCode maps expired/invalid to invalid_code', async () => {
    mocks.verifyOtp.mockResolvedValue({ data: {}, error: { status: 403, code: 'otp_expired', message: 'x' } });
    const r = await supabaseApi.verifyEmailCode('s@example.edu', '123456');
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ email: 's@example.edu', token: '123456', type: 'email' });
    expect(r.ok === false && r.error.code).toBe('invalid_code');
  });
  it('signOut maps to ok', async () => {
    mocks.signOut.mockResolvedValue({ error: null });
    expect((await supabaseApi.signOut()).ok).toBe(true);
  });
});

describe('adminListPending', () => {
  it('selects by cohort, newest first, and maps columns', async () => {
    const row = {
      id: 'p1', cohort_id: 'c1', email: 'student001@example.edu', idnumber: 'COBSCCOMP251P-001', lms_username: 'student001',
      first_name: 'Sam', last_name: 'Doe', status: 'pending', created_at: '2026-11-07T00:00:00+00:00', decided_at: null, decided_by: null,
      extra: 'dropped',
    };
    const order = vi.fn().mockResolvedValue({ data: [row], error: null });
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    mocks.from.mockReturnValue({ select });
    const r = await supabaseApi.adminListPending('c1');
    expect(mocks.from).toHaveBeenCalledWith('pending_registrations');
    expect(eq).toHaveBeenCalledWith('cohort_id', 'c1');
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false });
    const { extra: _drop, ...expected } = row;
    void _drop;
    expect(r).toEqual({ ok: true, data: [expected] });
  });
});
