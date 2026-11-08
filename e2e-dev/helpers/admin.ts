// Node-only helpers (service role). The secret key must never reach the browser or Vite.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const COHORT_CODE = '25.2';
const TEST_EMAIL = /^(e2e|nobody)\d+@example\.edu$/;

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set; run via "npm run e2e:dev"`);
  return v;
}

let service: SupabaseClient | undefined;
export function serviceClient(): SupabaseClient {
  service ??= createClient(need('DEV_SUPABASE_URL'), need('DEV_SECRET_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return service;
}

/** Client with the publishable key and a user's access token, to call RPCs as that user. */
export function userClient(accessToken: string): SupabaseClient {
  return createClient(need('DEV_SUPABASE_URL'), need('DEV_PUBLISHABLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export const emailOf = (n: number): string => `e2e${String(n).padStart(3, '0')}@example.edu`;
export const indexOf = (n: number): string => `COBSCCOMP251P-${String(n).padStart(3, '0')}`;

export async function cohortId(): Promise<string> {
  const { data, error } = await serviceClient().from('cohorts').select('id').eq('code', COHORT_CODE).single();
  if (error || !data) throw new Error(`cohort ${COHORT_CODE} not found`);
  return data.id as string;
}

export interface TestUser {
  id: string;
  email: string;
}

/** Create a confirmed auth user, a profile and (unless admin-only) an active student enrolment in 25.2. */
export async function createUser(n: number, opts: { admin?: boolean; enrol?: boolean } = {}): Promise<TestUser> {
  const sb = serviceClient();
  const email = emailOf(n);
  const { data, error } = await sb.auth.admin.createUser({ email, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message ?? 'no user'}`);
  const id = data.user.id;
  const p = await sb.from('profiles').insert({
    id,
    email,
    index_no: indexOf(n),
    first_name: 'E2E',
    last_name: `User${n}`,
    is_admin: opts.admin === true,
  });
  if (p.error) throw new Error(`profile ${email}: ${p.error.message}`);
  if (opts.enrol !== false) {
    const e = await sb.from('enrolments').insert({ cohort_id: await cohortId(), user_id: id, role: 'student' });
    if (e.error) throw new Error(`enrolment ${email}: ${e.error.message}`);
  }
  return { id, email };
}

/** 6-digit email code for an existing user, without sending any email. */
export async function emailCode(email: string): Promise<string> {
  const { data, error } = await serviceClient().auth.admin.generateLink({ type: 'magiclink', email });
  const otp = data?.properties?.email_otp;
  if (error || !otp) throw new Error(`generateLink ${email}: ${error?.message ?? 'no otp'}`);
  return otp;
}

/** Remove every e2e user (cascades to profiles/enrolments/credentials) and test pending rows. Idempotent. */
export async function cleanup(): Promise<void> {
  const sb = serviceClient();
  // S6: content created by e2e specs is titled "E2E …".
  const c = await sb.from('content_items').delete().like('title', 'E2E %');
  if (c.error) throw new Error(`content cleanup: ${c.error.message}`);
  for (let page = 1; page < 50; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    for (const u of data.users) {
      if (u.email && TEST_EMAIL.test(u.email)) {
        const d = await sb.auth.admin.deleteUser(u.id);
        if (d.error) throw new Error(`deleteUser: ${d.error.message}`);
      }
    }
    if (data.users.length < 200) break;
  }
  // pending_registrations has no FK to auth users; match by the fictional address pattern.
  const del = await sb.from('pending_registrations').delete().or('email.like.e2e%@example.edu,email.like.nobody%@example.edu');
  if (del.error) throw new Error(`pending cleanup: ${del.error.message}`);
}
