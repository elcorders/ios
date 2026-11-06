import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import type { EnrolmentRole, Member, ResetSecurityWhat } from '../../api/types';
import { messageFor } from '../../lib/errors';
import { formatColombo } from '../../lib/time';
import { useAdmin } from './AdminContext';
import { Dialog } from './Dialog';

type Action =
  | { kind: 'edit'; member: Member }
  | { kind: 'status'; member: Member }
  | { kind: 'reset'; member: Member };

const fullName = (m: Member) => `${m.first_name} ${m.last_name}`.trim();

export function MembersPage({ role }: { role: EnrolmentRole }) {
  const { cohort, readOnly, reloadCohorts } = useAdmin();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [showRemoved, setShowRemoved] = useState(false);
  const [action, setAction] = useState<Action | null>(null);

  const load = useCallback(async () => {
    const res = await api.listMembers(cohort.id, role);
    if (res.ok) {
      setMembers(res.data);
      setError(null);
    } else {
      setError(messageFor(res.error));
    }
  }, [cohort.id, role]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data load on cohort/role change
    setMembers(null);
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (members ?? [])
      .filter((m) => showRemoved || m.status === 'active')
      .filter((m) =>
        !q ||
        [m.index_no, m.first_name, m.last_name, fullName(m), m.email, m.phone, m.lms_username]
          .some((v) => v?.toLowerCase().includes(q)),
      );
  }, [members, query, showRemoved]);

  const done = async () => {
    setAction(null);
    await load();
    await reloadCohorts();
  };

  const title = role === 'student' ? 'Students' : 'Instructors';
  return (
    <div className="stack">
      <h2>{title}</h2>
      <div className="toolbar">
        <div className="field">
          <label htmlFor="member-search">Search</label>
          <input id="member-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <label className="check">
          <input type="checkbox" checked={showRemoved} onChange={(e) => setShowRemoved(e.target.checked)} />
          Show removed
        </label>
      </div>
      {error ? <p role="alert" className="error">{error}</p> : null}
      {!members && !error ? <p role="status">Loading…</p> : null}
      {members ? (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">{title} of cohort {cohort.code}</caption>
            <thead>
              <tr>
                <th scope="col">Index no</th>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Phone</th>
                <th scope="col">Security</th>
                <th scope="col">Last sign-in</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((m) => (
                <tr key={m.enrolment_id}>
                  <td>{m.index_no ?? ''}</td>
                  <td>{fullName(m)}</td>
                  <td>{m.email}</td>
                  <td>{m.phone ?? ''}</td>
                  <td>
                    <span className="badge">Passkeys {m.security.passkeys}</span>{' '}
                    <span className="badge">TOTP {m.security.totp ? 'yes' : 'no'}</span>
                  </td>
                  <td>{m.last_sign_in_at ? formatColombo(m.last_sign_in_at) : 'Never'}</td>
                  <td>{m.status}</td>
                  <td className="actions">
                    <button type="button" disabled={readOnly} aria-label={`Edit ${fullName(m)}`}
                      onClick={() => setAction({ kind: 'edit', member: m })}>Edit</button>
                    <button type="button" disabled={readOnly}
                      aria-label={`${m.status === 'active' ? 'Remove' : 'Restore'} ${fullName(m)}`}
                      onClick={() => setAction({ kind: 'status', member: m })}>
                      {m.status === 'active' ? 'Remove' : 'Restore'}
                    </button>
                    <button type="button" disabled={readOnly} aria-label={`Reset security ${fullName(m)}`}
                      onClick={() => setAction({ kind: 'reset', member: m })}>Reset security</button>
                  </td>
                </tr>
              ))}
              {visible.length === 0 ? (
                <tr><td colSpan={8}>No matching people.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
      {action?.kind === 'edit' ? (
        <EditDialog member={action.member} onCancel={() => setAction(null)} onDone={done} />
      ) : null}
      {action?.kind === 'status' ? (
        <StatusDialog member={action.member} onCancel={() => setAction(null)} onDone={done} />
      ) : null}
      {action?.kind === 'reset' ? (
        <ResetDialog member={action.member} onCancel={() => setAction(null)} onDone={done} />
      ) : null}
    </div>
  );
}

interface DialogBase {
  member: Member;
  onCancel: () => void;
  onDone: () => Promise<void>;
}

function EditDialog({ member, onCancel, onDone }: DialogBase) {
  const [first, setFirst] = useState(member.first_name);
  const [last, setLast] = useState(member.last_name);
  const [indexNo, setIndexNo] = useState(member.index_no ?? '');
  const [username, setUsername] = useState(member.lms_username ?? '');
  const [phone, setPhone] = useState(member.phone ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    const res = await api.adminUpdateProfile({
      user_id: member.user_id,
      first_name: first.trim(),
      last_name: last.trim(),
      index_no: indexNo.trim() || null,
      lms_username: username.trim() || null,
      phone: phone.trim() || null,
    });
    if (res.ok) await onDone();
    else {
      setError(messageFor(res.error));
      setBusy(false);
    }
  };

  return (
    <Dialog title="Edit profile" submitLabel="Save" onCancel={onCancel} onSubmit={() => void submit()} busy={busy} error={error}>
      <div className="field">
        <label htmlFor="ep-email">Email</label>
        <input id="ep-email" value={member.email} readOnly aria-describedby="ep-email-note" />
        <small id="ep-email-note">Change via import.</small>
      </div>
      <div className="field">
        <label htmlFor="ep-first">First name</label>
        <input id="ep-first" value={first} onChange={(e) => setFirst(e.target.value)} required />
      </div>
      <div className="field">
        <label htmlFor="ep-last">Last name</label>
        <input id="ep-last" value={last} onChange={(e) => setLast(e.target.value)} required />
      </div>
      <div className="field">
        <label htmlFor="ep-index">Index number</label>
        <input id="ep-index" value={indexNo} onChange={(e) => setIndexNo(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="ep-user">LMS username</label>
        <input id="ep-user" value={username} onChange={(e) => setUsername(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="ep-phone">Phone (+94…)</label>
        <input id="ep-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
    </Dialog>
  );
}

function StatusDialog({ member, onCancel, onDone }: DialogBase) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const removing = member.status === 'active';

  const submit = async () => {
    setBusy(true);
    const res = await api.adminSetEnrolmentStatus(member.enrolment_id, removing ? 'removed' : 'active');
    if (res.ok) await onDone();
    else {
      setError(messageFor(res.error));
      setBusy(false);
    }
  };

  return (
    <Dialog title={removing ? 'Remove from cohort' : 'Restore to cohort'} submitLabel={removing ? 'Remove' : 'Restore'}
      onCancel={onCancel} onSubmit={() => void submit()} busy={busy} error={error}>
      <p>{removing ? 'Remove' : 'Restore'} {fullName(member)} ({member.email})?</p>
    </Dialog>
  );
}

function ResetDialog({ member, onCancel, onDone }: DialogBase) {
  const [what, setWhat] = useState<ResetSecurityWhat>('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    const res = await api.adminResetSecurity(member.user_id, what);
    if (res.ok) await onDone();
    else {
      setError(messageFor(res.error));
      setBusy(false);
    }
  };

  return (
    <Dialog title="Reset security" submitLabel="Reset" onCancel={onCancel} onSubmit={() => void submit()} busy={busy} error={error}>
      <p>{fullName(member)} will have to set up sign-in security again.</p>
      <div className="field">
        <label htmlFor="reset-what">What to reset</label>
        <select id="reset-what" value={what} onChange={(e) => setWhat(e.target.value as ResetSecurityWhat)}>
          <option value="all">Passkeys and authenticator app</option>
          <option value="passkeys">Passkeys only</option>
          <option value="totp">Authenticator app only</option>
        </select>
      </div>
    </Dialog>
  );
}
