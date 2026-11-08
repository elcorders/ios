import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import type { AdminTransfers, EnrolmentRole, EnrolmentStatus, Member, ResetSecurityWhat } from '../../api/types';
import { messageFor } from '../../lib/errors';
import { formatColombo } from '../../lib/time';
import { useAdmin } from './AdminContext';
import { Dialog } from './Dialog';
import { BeforeAfter } from './transfers/BeforeAfter';
import { NoteField } from './transfers/NoteField';
import { afterSizes, spread } from './transfers/transferLogic';
import { BulkBar, BulkConfirm, BulkSummary, type BulkSummaryData } from './table/BulkBar';
import { FilterChips } from './table/FilterChips';
import { RowMenu } from './table/RowMenu';
import { SortableHeader } from './table/SortableHeader';
import { useBulkSelection } from './table/useBulkSelection';
import { useSort, useSorted } from './table/useSort';
import './table/table.css';

type Action =
  | { kind: 'edit'; member: Member }
  | { kind: 'status'; member: Member; target: EnrolmentStatus }
  | { kind: 'reset'; member: Member }
  | { kind: 'move'; member: Member };

type Filter = 'active' | 'removed' | 'discarded' | 'all';
type SortKey = 'index' | 'name' | 'email' | 'group' | 'signin';
type BulkKind = 'removed' | 'active' | 'discarded';

const fullName = (m: Member) => `${m.first_name} ${m.last_name}`.trim();

const SORTERS = {
  index: (m: Member) => m.index_no,
  name: (m: Member) => fullName(m),
  email: (m: Member) => m.email,
  group: (m: Member) => m.group_no,
  signin: (m: Member) => m.last_sign_in_at,
};

const BULK_TEXT: Record<BulkKind, { title: string; submit: string; note: string }> = {
  removed: { title: 'Remove selected', submit: 'Remove', note: 'They lose access to the cohort. You can restore them later.' },
  active: { title: 'Restore selected', submit: 'Restore', note: 'They become active in the cohort again.' },
  discarded: {
    title: 'Discard selected', submit: 'Discard',
    note: 'They will be hidden everywhere. Nothing is deleted and they can be restored.',
  },
};

export function MembersPage({ role }: { role: EnrolmentRole }) {
  const { cohort, readOnly, reloadCohorts } = useAdmin();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('active');
  const [action, setAction] = useState<Action | null>(null);
  const [bulk, setBulk] = useState<BulkKind | null>(null);
  const [summary, setSummary] = useState<BulkSummaryData | null>(null);
  const sort = useSort<SortKey>('index');
  const isStudents = role === 'student';

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

  const counts = useMemo(() => {
    const all = members ?? [];
    return {
      active: all.filter((m) => m.status === 'active').length,
      removed: all.filter((m) => m.status === 'removed').length,
      discarded: all.filter((m) => m.status === 'discarded').length,
      all: all.length,
    };
  }, [members]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (members ?? [])
      .filter((m) => filter === 'all' || m.status === filter)
      .filter((m) =>
        !q ||
        [m.index_no, m.first_name, m.last_name, fullName(m), m.email, m.phone, m.lms_username]
          .some((v) => v?.toLowerCase().includes(q)),
      );
  }, [members, query, filter]);
  const visible = useSorted(filtered, sort, SORTERS);

  const ids = useMemo(() => visible.map((m) => m.enrolment_id), [visible]);
  const sel = useBulkSelection(readOnly ? [] : ids);
  const selectedMembers = visible.filter((m) => sel.selected.includes(m.enrolment_id));
  const canRemove = selectedMembers.some((m) => m.status === 'active');
  const canRestore = selectedMembers.some((m) => m.status !== 'active');
  const canDiscard = selectedMembers.some((m) => m.status !== 'discarded');

  const done = async () => {
    setAction(null);
    await load();
    await reloadCohorts();
  };

  const bulkItems = (kind: BulkKind) =>
    selectedMembers
      .filter((m) => (kind === 'removed' ? m.status === 'active' : kind === 'active' ? m.status !== 'active' : m.status !== 'discarded'))
      .map((m) => ({ id: m.enrolment_id, label: fullName(m) }));

  const finishBulk = async (s: BulkSummaryData) => {
    setBulk(null);
    setSummary(s);
    sel.clear();
    await load();
    await reloadCohorts();
  };

  const title = isStudents ? 'Students' : 'Instructors';
  const showSelect = !readOnly;
  const colCount = 7 + (isStudents ? 1 : 0) + (showSelect ? 2 : 0);

  return (
    <div className="stack">
      <h2>{title}</h2>
      <div className="toolbar">
        <div className="field">
          <label htmlFor="member-search">Search</label>
          <input id="member-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <FilterChips<Filter> label="Show" value={filter} onChange={setFilter} options={[
          { key: 'active', label: 'Active', count: counts.active },
          { key: 'removed', label: 'Removed', count: counts.removed },
          { key: 'discarded', label: 'Discarded', count: counts.discarded },
          { key: 'all', label: 'All', count: counts.all },
        ]} />
      </div>
      {error ? <p role="alert" className="error">{error}</p> : null}
      {summary ? <BulkSummary summary={summary} onDismiss={() => setSummary(null)} /> : null}
      {!members && !error ? <p role="status">Loading…</p> : null}
      {members ? (
        <div className="table-wrap admin-table">
          <table>
            <caption className="sr-only">{title} of cohort {cohort.code}</caption>
            <thead>
              <tr>
                {showSelect ? (
                  <th scope="col" className="c-select">
                    <input type="checkbox" aria-label="Select all shown" checked={sel.allSelected}
                      disabled={visible.length === 0} onChange={(e) => sel.setAll(e.target.checked)} />
                  </th>
                ) : null}
                <SortableHeader label="Index no" sortKey="index" sort={sort} />
                <SortableHeader label="Name" sortKey="name" sort={sort} />
                <SortableHeader label="Email" sortKey="email" sort={sort} />
                <th scope="col">Phone</th>
                {isStudents ? <SortableHeader label="Group" sortKey="group" sort={sort} /> : null}
                <th scope="col">Security</th>
                <SortableHeader label="Last sign-in" sortKey="signin" sort={sort} />
                <th scope="col">Status</th>
                {showSelect ? <th scope="col"><span className="sr-only">Actions</span></th> : null}
              </tr>
            </thead>
            <tbody>
              {visible.map((m) => {
                const name = fullName(m);
                const selected = sel.isSelected(m.enrolment_id);
                return (
                  <tr key={m.enrolment_id} className={selected ? 'is-selected' : undefined}>
                    {showSelect ? (
                      <td className="c-select">
                        <input type="checkbox" aria-label={`Select ${name}`} checked={selected}
                          onChange={() => sel.toggle(m.enrolment_id)} />
                      </td>
                    ) : null}
                    <td className="c-index c-mono">{m.index_no ?? ''}</td>
                    <td className="c-name">{name}</td>
                    <td className="c-email">{m.email}</td>
                    <td className="c-hide-phone">{m.phone ?? ''}</td>
                    {isStudents ? (
                      <td className="c-group" data-set={m.group_no !== null ? '' : undefined}>
                        {m.group_no ?? '—'}
                      </td>
                    ) : null}
                    <td className="c-security">
                      <span className="badge">Passkeys {m.security.passkeys}</span>{' '}
                      <span className="badge">TOTP {m.security.totp ? 'yes' : 'no'}</span>
                    </td>
                    <td className="c-hide-phone">{m.last_sign_in_at ? formatColombo(m.last_sign_in_at) : 'Never'}</td>
                    <td className="c-status">{m.status}</td>
                    {showSelect ? (
                      <td className="c-actions">
                        <RowMenu label={`Actions for ${name}`} items={[
                          { label: 'Edit', ariaLabel: `Edit ${name}`, onSelect: () => setAction({ kind: 'edit', member: m }) },
                          { label: 'Reset security', ariaLabel: `Reset security ${name}`, onSelect: () => setAction({ kind: 'reset', member: m }) },
                          m.status === 'active'
                            ? { label: 'Remove', ariaLabel: `Remove ${name}`, onSelect: () => setAction({ kind: 'status', member: m, target: 'removed' }) }
                            : { label: 'Restore', ariaLabel: `Restore ${name}`, onSelect: () => setAction({ kind: 'status', member: m, target: 'active' }) },
                          ...(isStudents && m.status === 'active'
                            ? [{ label: 'Move to group…', ariaLabel: `Move ${name} to group`, onSelect: () => setAction({ kind: 'move', member: m }) }]
                            : []),
                          ...(m.status !== 'discarded'
                            ? [{ label: 'Discard', ariaLabel: `Discard ${name}`, danger: true, onSelect: () => setAction({ kind: 'status', member: m, target: 'discarded' }) }]
                            : []),
                        ]} />
                      </td>
                    ) : null}
                  </tr>
                );
              })}
              {visible.length === 0 ? (
                <tr><td colSpan={colCount}>No matching people.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
      {showSelect ? (
        <BulkBar count={sel.selected.length} onClear={sel.clear}>
          {canRemove ? <button type="button" onClick={() => setBulk('removed')}>Remove</button> : null}
          {canRestore ? <button type="button" onClick={() => setBulk('active')}>Restore</button> : null}
          {canDiscard ? <button type="button" onClick={() => setBulk('discarded')}>Discard</button> : null}
        </BulkBar>
      ) : null}
      {bulk ? (
        <BulkConfirm
          title={BULK_TEXT[bulk].title}
          submitLabel={BULK_TEXT[bulk].submit}
          body={<p>{BULK_TEXT[bulk].submit} {bulkItems(bulk).length} {bulkItems(bulk).length === 1 ? 'person' : 'people'}? {BULK_TEXT[bulk].note}</p>}
          items={bulkItems(bulk)}
          run={(id) => api.adminSetEnrolmentStatus(id, bulk)}
          onCancel={() => setBulk(null)}
          onFinished={(s) => void finishBulk(s)}
        />
      ) : null}
      {action?.kind === 'edit' ? (
        <EditDialog member={action.member} onCancel={() => setAction(null)} onDone={done} />
      ) : null}
      {action?.kind === 'status' ? (
        <StatusDialog member={action.member} target={action.target} onCancel={() => setAction(null)} onDone={done} />
      ) : null}
      {action?.kind === 'move' ? (
        <MoveDialog member={action.member} cohortId={cohort.id} onCancel={() => setAction(null)} onDone={done} />
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

function StatusDialog({ member, target, onCancel, onDone }: DialogBase & { target: EnrolmentStatus }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    const res = await api.adminSetEnrolmentStatus(member.enrolment_id, target);
    if (res.ok) await onDone();
    else {
      setError(messageFor(res.error));
      setBusy(false);
    }
  };

  const verb = target === 'removed' ? 'Remove' : target === 'discarded' ? 'Discard' : 'Restore';
  const heading = target === 'removed' ? 'Remove from cohort' : target === 'discarded' ? 'Discard person' : 'Restore to cohort';
  return (
    <Dialog title={heading} submitLabel={verb} onCancel={onCancel} onSubmit={() => void submit()} busy={busy} error={error}>
      <p>{verb} {fullName(member)} ({member.email})?</p>
      {target === 'discarded' ? (
        <p>They will be hidden everywhere. Nothing is deleted and they can be restored.</p>
      ) : null}
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

function MoveDialog({ member, cohortId, onCancel, onDone }: DialogBase & { cohortId: string }) {
  const [data, setData] = useState<AdminTransfers | null>(null);
  const [target, setTarget] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void api.adminListTransfers(cohortId).then((res) => {
      if (!live) return;
      if (res.ok) setData(res.data);
      else setError(messageFor(res.error));
    });
    return () => {
      live = false;
    };
  }, [cohortId]);

  const groups = data?.groups ?? [];
  const to = Number(target) || null;
  const warn = to !== null && (() => {
    const before = spread(groups);
    const after = spread(afterSizes(groups, member.group_no, to, member.has_mac));
    return after >= 2 && after > before;
  })();

  const submit = async () => {
    if (to === null) {
      setError('Choose a group first.');
      return;
    }
    setBusy(true);
    const res = await api.adminMoveStudent({ enrolmentId: member.enrolment_id, groupNo: to, note: note.trim() || null });
    if (res.ok) {
      void api.adminSendOutbox();
      await onDone();
    } else {
      setError(messageFor(res.error));
      setBusy(false);
    }
  };

  return (
    <Dialog title="Move to group" submitLabel="Move" onCancel={onCancel} onSubmit={() => void submit()} busy={busy} error={error}>
      <p>
        Move {fullName(member)} {member.group_no !== null ? `(now in Group ${member.group_no})` : '(no group yet)'}. They will be emailed.
        Any open transfer request of theirs is closed.
      </p>
      <div className="field">
        <label htmlFor="move-group">New group</label>
        <select id="move-group" value={target} onChange={(e) => setTarget(e.target.value)} disabled={!data}>
          <option value="">Choose a group…</option>
          {groups.filter((g) => g.no !== member.group_no).map((g) => <option key={g.no} value={g.no}>{g.name}</option>)}
        </select>
      </div>
      {to !== null ? <BeforeAfter groups={groups} from={member.group_no} to={to} hasMac={member.has_mac} warn={warn} /> : null}
      <NoteField value={note} onChange={setNote} />
    </Dialog>
  );
}
