import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../../api';
import type { AdminTransferRow, AdminTransfers, GroupStat, Result, TransferDecision } from '../../api/types';
import { messageFor } from '../../lib/errors';
import { formatColombo } from '../../lib/time';
import { useAdmin } from './AdminContext';
import { Dialog } from './Dialog';
import { FilterChips } from './table/FilterChips';
import { BeforeAfter, GroupStrip, MacLegend } from './transfers/BeforeAfter';
import { NoteField } from './transfers/NoteField';
import { announceOpenCount } from './transfers/openCount';
import { findSwapPairs, suggest, type SwapPair } from './transfers/transferLogic';
import './transfers/transfers.css';

type Filter = 'open' | 'approved' | 'rejected' | 'cancelled' | 'all';

type Pending =
  | { kind: 'approve'; row: AdminTransferRow; groupNo: number; suggested: boolean }
  | { kind: 'reject'; row: AdminTransferRow }
  | { kind: 'swap'; pair: SwapPair };

const fullName = (r: AdminTransferRow) => `${r.first_name} ${r.last_name}`.trim() || r.email;
const macLabel = (v: boolean | null) => (v === true ? 'Has Mac' : v === false ? 'No Mac' : 'Mac unknown');
const isStale = (r: AdminTransferRow) => r.enrolment_status !== 'active' || r.current_no !== r.from_no;

/** Admin queue of group transfer requests (S8.F2). The backend decides; this only previews. */
export function TransfersPage() {
  const { cohort, readOnly } = useAdmin();
  const [data, setData] = useState<AdminTransfers | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('open');
  const [pending, setPending] = useState<Pending | null>(null);
  const [busySwitch, setBusySwitch] = useState(false);

  const load = useCallback(async () => {
    const res = await api.adminListTransfers(cohort.id);
    if (res.ok) {
      setData(res.data);
      setError(null);
    } else {
      setError(messageFor(res.error));
    }
  }, [cohort.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data load on cohort change
    setData(null);
    void load();
  }, [load]);

  const rows = data?.requests;
  const openCount = useMemo(() => (rows ?? []).filter((r) => r.status === 'open').length, [rows]);
  useEffect(() => {
    if (rows) announceOpenCount(cohort.id, openCount);
  }, [rows, openCount, cohort.id]);

  const counts = useMemo(() => {
    const all = rows ?? [];
    const n = (s: string) => all.filter((r) => r.status === s).length;
    return { open: n('open'), approved: n('approved'), rejected: n('rejected'), cancelled: n('cancelled'), all: all.length };
  }, [rows]);

  const pairs = useMemo(() => (filter === 'open' && rows ? findSwapPairs(rows) : []), [filter, rows]);
  const pairedIds = useMemo(() => new Set(pairs.flatMap((p) => [p.a.id, p.b.id])), [pairs]);

  const visible = useMemo(() => {
    const list = (rows ?? []).filter((r) => filter === 'all' || r.status === filter);
    const open = list.filter((r) => r.status === 'open');
    const done = list
      .filter((r) => r.status !== 'open')
      .sort((x, y) => (y.decided_at ?? y.created_at).localeCompare(x.decided_at ?? x.created_at));
    return [...open.filter((r) => !pairedIds.has(r.id)), ...done];
  }, [rows, filter, pairedIds]);

  /** After a send, refresh just the outbox counts (and nothing else the admin might be reading). */
  const refreshOutbox = useCallback(async () => {
    const res = await api.adminListTransfers(cohort.id);
    if (res.ok) setData((d) => (d ? { ...d, outbox: res.data.outbox } : d));
  }, [cohort.id]);

  const fireOutbox = useCallback(() => {
    void api.adminSendOutbox().then(() => refreshOutbox());
  }, [refreshOutbox]);

  const apply = (d: TransferDecision) => {
    const byId = new Map(d.requests.map((r) => [r.id, r]));
    setData((cur) =>
      cur ? { ...cur, groups: d.groups, requests: cur.requests.map((r) => byId.get(r.id) ?? r) } : cur,
    );
  };

  /** Returns an error message to show in the dialog, or null when done. */
  const finish = async (res: Result<TransferDecision>): Promise<string | null> => {
    if (res.ok) {
      apply(res.data);
      setPending(null);
      setNotice(null);
      fireOutbox();
      return null;
    }
    if (res.error.code === 'conflict') {
      setPending(null);
      setNotice('This request changed — reloaded.');
      await load();
      return null;
    }
    return messageFor(res.error);
  };

  const toggleOpen = async () => {
    if (!data) return;
    setBusySwitch(true);
    const res = await api.adminUpdateCohortSettings(cohort.id, { transfers_open: !data.transfers_open });
    setBusySwitch(false);
    if (res.ok) setData((d) => (d ? { ...d, transfers_open: !d.transfers_open } : d));
    else setNotice(messageFor(res.error));
  };

  const retry = async () => {
    const res = await api.adminSendOutbox(true);
    if (!res.ok) setNotice(messageFor(res.error));
    await load();
  };

  if (error) return <p role="alert" className="error">{error}</p>;
  if (!data) return <p role="status">Loading…</p>;

  const unsent = data.outbox.queued + data.outbox.failed;
  const groups = data.groups;

  return (
    <div className="tr-scope stack">
      <div className="tr-head">
        <h2>Group transfers</h2>
        <button type="button" role="switch" aria-checked={data.transfers_open} className="tr-switch"
          disabled={readOnly || busySwitch} onClick={() => void toggleOpen()}>
          <span>Transfer requests: {data.transfers_open ? 'Open' : 'Closed'}</span>
          <span className="tr-knob" aria-hidden="true" />
        </button>
      </div>
      {readOnly ? <p role="status" className="banner">This cohort is archived, so transfers cannot be changed.</p> : null}
      {notice ? <p role="alert" className="error">{notice}</p> : null}
      {unsent > 0 ? (
        <p role="status" className="banner">
          {unsent} {unsent === 1 ? 'email' : 'emails'} not sent{' '}
          <button type="button" onClick={() => void retry()}>Retry</button>
        </p>
      ) : null}

      <section className="card" aria-labelledby="tr-strip-h">
        <h3 id="tr-strip-h">Group sizes</h3>
        <MacLegend />
        <GroupStrip groups={groups} />
      </section>

      <FilterChips<Filter> label="Show requests" value={filter} onChange={setFilter} options={[
        { key: 'open', label: 'Open', count: counts.open },
        { key: 'approved', label: 'Approved', count: counts.approved },
        { key: 'rejected', label: 'Rejected', count: counts.rejected },
        { key: 'cancelled', label: 'Cancelled', count: counts.cancelled },
        { key: 'all', label: 'All', count: counts.all },
      ]} />

      {pairs.length > 0 ? (
        <section className="stack" aria-labelledby="tr-swaps-h">
          <h3 id="tr-swaps-h">Swap pairs</h3>
          <div className="tr-cards">
            {pairs.map((p) => (
              <article key={`${p.a.id}-${p.b.id}`} className="tr-card" aria-label={`Swap ${fullName(p.a)} and ${fullName(p.b)}`}>
                <h4>{fullName(p.a)} ⇄ {fullName(p.b)}</h4>
                <p className="tr-swap-line">A: {fullName(p.a)}, Group {p.a.from_no} → {p.b.from_no}</p>
                <p className="tr-swap-line">B: {fullName(p.b)}, Group {p.b.from_no} → {p.a.from_no}</p>
                <p className="tr-note">Sizes unchanged</p>
                <div className="tr-actions">
                  <button type="button" disabled={readOnly} onClick={() => setPending({ kind: 'swap', pair: p })}>Approve both</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="stack" aria-labelledby="tr-queue-h">
        <h3 id="tr-queue-h">Requests</h3>
        {visible.length === 0 && pairs.length === 0 ? <p className="gr-muted">No requests here.</p> : null}
        <div className="tr-cards">
          {visible.map((r) =>
            r.status === 'open' ? (
              <RequestCard key={r.id} row={r} groups={groups} readOnly={readOnly} onPick={setPending} />
            ) : (
              <HistoryCard key={r.id} row={r} />
            ),
          )}
        </div>
      </section>

      {pending ? (
        <DecisionDialog
          pending={pending}
          groups={groups}
          onCancel={() => setPending(null)}
          onRun={async (note) => {
            const n = note.trim() || null;
            if (pending.kind === 'approve') {
              return finish(await api.adminDecideTransfer({ requestId: pending.row.id, approve: true, groupNo: pending.groupNo, note: n }));
            }
            if (pending.kind === 'reject') {
              return finish(await api.adminDecideTransfer({ requestId: pending.row.id, approve: false, groupNo: null, note: n }));
            }
            return finish(await api.adminApproveSwap(pending.pair.a.id, pending.pair.b.id, n));
          }}
        />
      ) : null}
    </div>
  );
}

function RequestCard({ row, groups, readOnly, onPick }: {
  row: AdminTransferRow; groups: GroupStat[]; readOnly: boolean; onPick: (p: Pending) => void;
}) {
  const name = fullName(row);
  const stale = isStale(row);
  const s = suggest(groups, row);
  const others = groups.filter((g) => g.no !== row.from_no);
  return (
    <article className="tr-card" aria-label={`Request from ${name}`}>
      <h4>{name}</h4>
      <div className="tr-meta">
        <span>{row.email}</span>
        {row.index_no ? <span>{row.index_no}</span> : null}
        <span className="badge">{macLabel(row.has_mac)}</span>
        <span>Group {row.current_no ?? '—'}</span>
        <span>Sent {formatColombo(row.created_at)}</span>
      </div>
      <p className="tr-reason">{row.reason}</p>
      {stale ? (
        <>
          <p role="note" className="tr-warn">Student moved/removed — can only reject</p>
          <div className="tr-actions">
            <button type="button" disabled={readOnly} onClick={() => onPick({ kind: 'reject', row })}>Reject</button>
          </div>
        </>
      ) : (
        <>
          <div className="tr-options">
            {s.options.map((o, i) => {
              const suggested = s.choice === (i === 0 ? 'pref1' : 'pref2');
              return (
                <div className="tr-option" key={o.groupNo}>
                  <h5 className="tr-note">Preference {i + 1}: Group {o.groupNo}</h5>
                  <BeforeAfter groups={groups} from={row.from_no} to={o.groupNo} hasMac={row.has_mac} warn={o.warn} suggested={suggested} />
                  <button type="button" disabled={readOnly}
                    onClick={() => onPick({ kind: 'approve', row, groupNo: o.groupNo, suggested })}>
                    Approve → Group {o.groupNo}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="tr-actions">
            <select aria-label={`Other group for ${name}`} value="" disabled={readOnly}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (n) onPick({ kind: 'approve', row, groupNo: n, suggested: false });
              }}>
              <option value="">Other group…</option>
              {others.map((g) => <option key={g.no} value={g.no}>{g.name}</option>)}
            </select>
            <button type="button" disabled={readOnly} onClick={() => onPick({ kind: 'reject', row })}>Reject</button>
          </div>
        </>
      )}
    </article>
  );
}

function HistoryCard({ row }: { row: AdminTransferRow }) {
  const name = fullName(row);
  let outcome: ReactNode;
  if (row.status === 'approved') outcome = `Moved to Group ${row.decided_no ?? '?'} (from Group ${row.from_no})`;
  else if (row.status === 'rejected') outcome = 'Rejected';
  else outcome = row.closed_by === 'admin' ? 'Cancelled by admin' : 'Cancelled by student';
  return (
    <article className="tr-card" aria-label={`${row.status} request from ${name}`}>
      <h4>{name}</h4>
      <div className="tr-meta">
        <span>{row.email}</span>
        {row.index_no ? <span>{row.index_no}</span> : null}
        <span className="badge">{row.status}</span>
      </div>
      <p className="tr-reason">{row.reason}</p>
      <p className="tr-swap-line">{outcome}</p>
      {row.admin_note ? <p className="tr-note">Note: {row.admin_note}</p> : null}
      <p className="tr-note">
        Sent {formatColombo(row.created_at)}
        {row.decided_at ? ` · Decided ${formatColombo(row.decided_at)}` : ''}
        {row.decided_by_email ? ` by ${row.decided_by_email}` : ''}
      </p>
    </article>
  );
}

function DecisionDialog({ pending, groups, onCancel, onRun }: {
  pending: Pending; groups: GroupStat[]; onCancel: () => void; onRun: (note: string) => Promise<string | null>;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    const err = await onRun(note);
    if (err) {
      setError(err);
      setBusy(false);
    }
  };

  let title: string;
  let label: string;
  let body: ReactNode;
  if (pending.kind === 'approve') {
    const { row, groupNo, suggested } = pending;
    const warn = suggest(groups, { ...row, pref1_no: groupNo, pref2_no: groupNo }).options[0].warn;
    title = `Approve → Group ${groupNo}`;
    label = 'Approve';
    body = (
      <>
        <p>Move {fullName(row)} from Group {row.from_no} to Group {groupNo}? They will be emailed.</p>
        <BeforeAfter groups={groups} from={row.from_no} to={groupNo} hasMac={row.has_mac} warn={warn} suggested={suggested} />
      </>
    );
  } else if (pending.kind === 'reject') {
    title = 'Reject request';
    label = 'Reject';
    body = <p>Reject the request from {fullName(pending.row)}? They stay in Group {pending.row.from_no} and will be emailed.</p>;
  } else {
    const { a, b } = pending.pair;
    title = 'Approve swap';
    label = 'Approve both';
    body = (
      <>
        <p>{fullName(a)}: Group {a.from_no} → {b.from_no}</p>
        <p>{fullName(b)}: Group {b.from_no} → {a.from_no}</p>
        <p className="tr-note">Group sizes stay the same. Both students will be emailed.</p>
      </>
    );
  }

  return (
    <Dialog title={title} submitLabel={label} onCancel={onCancel} onSubmit={() => void submit()} busy={busy} error={error}>
      {body}
      <NoteField value={note} onChange={setNote} />
    </Dialog>
  );
}
