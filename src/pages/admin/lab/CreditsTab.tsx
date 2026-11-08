import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../../api';
import type { LabCreditRow } from '../../../api/types';
import { messageFor } from '../../../lib/errors';
import { Dialog } from '../Dialog';
import { useAdmin } from '../AdminContext';
import { FilterChips } from '../table/FilterChips';
import { SortableHeader } from '../table/SortableHeader';
import { useSort, useSorted } from '../table/useSort';
import '../table/table.css';

type Filter = 'all' | 'eligible' | 'suspended' | 'low';
type SortKey = 'index' | 'name' | 'remaining';
type Action = { kind: 'adjust' | 'clear'; row: LabCreditRow } | null;

const nameOf = (r: LabCreditRow) => `${r.first_name} ${r.last_name}`.trim();

export function CreditsTab() {
  const { cohort, readOnly } = useAdmin();
  const [rows, setRows] = useState<LabCreditRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [action, setAction] = useState<Action>(null);
  const sort = useSort<SortKey>('index');

  const load = useCallback(async () => {
    const res = await api.adminLabCredits(cohort.id);
    if (res.ok) {
      setRows(res.data);
      setError(null);
    } else setError(messageFor(res.error));
  }, [cohort.id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset + load on cohort change
    setRows(null);
    void load();
  }, [load]);

  const matches: Record<Filter, (r: LabCreditRow) => boolean> = {
    all: () => true,
    eligible: (r) => r.eligible,
    suspended: (r) => r.suspended,
    low: (r) => r.remaining <= 2,
  };
  const counts = useMemo(() => {
    const list = rows ?? [];
    return { all: list.length, eligible: list.filter(matches.eligible).length, suspended: list.filter(matches.suspended).length, low: list.filter(matches.low).length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter((r) => matches[filter](r) && (!q || `${nameOf(r)} ${r.index_no ?? ''} ${r.email}`.toLowerCase().includes(q)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, query, filter]);
  const visible = useSorted(filtered, sort, {
    index: (r) => r.index_no,
    name: (r) => nameOf(r),
    remaining: (r) => r.remaining,
  });

  return (
    <div className="stack">
      <h3>Credits</h3>
      <p className="muted">Current cycle, active students of {cohort.code}.</p>
      <div className="toolbar">
        <div className="field">
          <label htmlFor="cr-search">Search</label>
          <input id="cr-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <FilterChips<Filter> label="Show" value={filter} onChange={setFilter} options={[
          { key: 'all', label: 'All', count: counts.all },
          { key: 'eligible', label: 'Eligible', count: counts.eligible },
          { key: 'suspended', label: 'Suspended', count: counts.suspended },
          { key: 'low', label: 'Low credits', count: counts.low },
        ]} />
      </div>
      {error ? <p role="alert" className="error">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {!rows && !error ? <p role="status">Loading…</p> : null}
      {rows ? (
        <div className="table-wrap admin-table">
          <table>
            <caption className="sr-only">Lab credits for cohort {cohort.code}</caption>
            <thead>
              <tr>
                <SortableHeader label="Index no" sortKey="index" sort={sort} />
                <SortableHeader label="Name" sortKey="name" sort={sort} />
                <th scope="col">Group</th>
                <th scope="col">Eligible</th>
                <th scope="col">Allowance</th>
                <th scope="col">Used</th>
                <SortableHeader label="Remaining" sortKey="remaining" sort={sort} />
                <th scope="col">No-shows</th>
                <th scope="col">Suspended</th>
                <th scope="col">Upcoming</th>
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.enrolment_id}>
                  <td className="c-index c-mono">{r.index_no ?? ''}</td>
                  <td className="c-name">{nameOf(r)}</td>
                  <td className="c-group" data-set={r.group_no !== null ? '' : undefined}>{r.group_no ?? '—'}</td>
                  <td className="c-hide-phone">{r.eligible ? 'Yes' : 'No'}</td>
                  <td className="c-hide-phone">{r.allowance}</td>
                  <td className="c-hide-phone">{r.used}</td>
                  <td className="c-status">{r.remaining} left ({r.used}/{r.allowance})</td>
                  <td className="c-hide-phone">{r.no_shows}</td>
                  <td className="c-wide">{r.suspended ? <span className="badge">Suspended</span> : null}{r.eligible ? '' : ' Not eligible'}</td>
                  <td className="c-hide-phone">{r.upcoming}</td>
                  <td className="c-actions">
                    <div className="row actions">
                      <button type="button" aria-label={`Adjust credits ${nameOf(r)}`} disabled={readOnly} onClick={() => setAction({ kind: 'adjust', row: r })}>Adjust</button>
                      {r.suspended ? (
                        <button type="button" aria-label={`Clear suspension ${nameOf(r)}`} disabled={readOnly} onClick={() => setAction({ kind: 'clear', row: r })}>Clear suspension</button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {visible.length === 0 ? <tr><td colSpan={11}>No matching students.</td></tr> : null}
            </tbody>
          </table>
        </div>
      ) : null}
      {action?.kind === 'adjust' ? (
        <AdjustDialog row={action.row} onCancel={() => setAction(null)}
          onDone={(m) => { setAction(null); setNotice(m); void load(); }} />
      ) : null}
      {action?.kind === 'clear' ? (
        <ClearDialog row={action.row} onCancel={() => setAction(null)}
          onDone={(m) => { setAction(null); setNotice(m); void load(); }} />
      ) : null}
    </div>
  );
}

function AdjustDialog({ row, onCancel, onDone }: { row: LabCreditRow; onCancel: () => void; onDone: (m: string) => void }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const n = Number(amount);
    if (amount.trim() === '' || !Number.isInteger(n) || n === 0 || n < -50 || n > 50) return setError('Amount must be a whole number from -50 to 50, not 0.');
    if (!reason.trim()) return setError('A reason is required.');
    setBusy(true);
    const res = await api.adminAdjustCredits(row.enrolment_id, n, reason.trim());
    setBusy(false);
    if (res.ok) onDone(`${nameOf(row)}: ${res.data.remaining} credits left.`);
    else setError(messageFor(res.error));
  };

  return (
    <Dialog title={`Adjust credits: ${nameOf(row)}`} submitLabel="Apply" busy={busy} error={error} onCancel={onCancel} onSubmit={() => void submit()}>
      <div className="field">
        <label htmlFor="adj-amount">Amount (-50 to 50)</label>
        <input id="adj-amount" type="number" min={-50} max={50} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="adj-reason">Reason</label>
        <input id="adj-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
    </Dialog>
  );
}

function ClearDialog({ row, onCancel, onDone }: { row: LabCreditRow; onCancel: () => void; onDone: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    const res = await api.adminClearSuspension(row.enrolment_id);
    setBusy(false);
    if (res.ok) onDone(`Suspension cleared for ${nameOf(row)}.`);
    else setError(messageFor(res.error));
  };
  return (
    <Dialog title="Clear suspension" submitLabel="Clear suspension" busy={busy} error={error} onCancel={onCancel} onSubmit={() => void submit()}>
      <p>Allow {nameOf(row)} to book again for the rest of this cycle?</p>
    </Dialog>
  );
}
