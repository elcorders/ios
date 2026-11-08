import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import type { PendingRegistration } from '../../api/types';
import { messageFor } from '../../lib/errors';
import { formatColombo } from '../../lib/time';
import { useAdmin } from './AdminContext';
import { Dialog } from './Dialog';
import { BulkBar, BulkConfirm, BulkSummary, type BulkSummaryData } from './table/BulkBar';
import { FilterChips } from './table/FilterChips';
import { RowMenu } from './table/RowMenu';
import { SortableHeader } from './table/SortableHeader';
import { useBulkSelection } from './table/useBulkSelection';
import { useSort, useSorted } from './table/useSort';
import './table/table.css';

type Kind = 'approve' | 'reject' | 'discard' | 'restore';
type BulkKind = 'approve' | 'reject' | 'discard';
type Filter = 'pending' | 'decided' | 'discarded' | 'all';
type SortKey = 'email' | 'idnumber' | 'username' | 'name' | 'status' | 'created';

interface Decision {
  row: PendingRegistration;
  kind: Kind;
}

const nameOf = (r: PendingRegistration) => `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim();

const SORTERS = {
  email: (r: PendingRegistration) => r.email,
  idnumber: (r: PendingRegistration) => r.idnumber,
  username: (r: PendingRegistration) => r.lms_username,
  name: (r: PendingRegistration) => nameOf(r),
  status: (r: PendingRegistration) => r.status,
  created: (r: PendingRegistration) => r.created_at,
};

const callFor = (kind: Kind, id: string) =>
  kind === 'approve' ? api.approvePending(id)
    : kind === 'reject' ? api.rejectPending(id)
      : api.adminSetPendingStatus(id, kind === 'discard' ? 'discarded' : 'pending');

const BULK_TEXT: Record<BulkKind, { title: string; submit: string; note: string }> = {
  approve: { title: 'Approve selected', submit: 'Approve', note: 'They are added to the cohort as students.' },
  reject: { title: 'Reject selected', submit: 'Reject', note: '' },
  discard: { title: 'Discard selected', submit: 'Discard', note: 'They are hidden everywhere. Nothing is deleted and they can be restored.' },
};

export function PendingPage() {
  const { cohort, readOnly, reloadCohorts } = useAdmin();
  const [rows, setRows] = useState<PendingRegistration[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('pending');
  const [decision, setDecision] = useState<Decision | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [bulk, setBulk] = useState<BulkKind | null>(null);
  const [summary, setSummary] = useState<BulkSummaryData | null>(null);
  const sort = useSort<SortKey>('created', 'desc');

  const load = useCallback(async () => {
    const res = await api.adminListPending(cohort.id);
    if (res.ok) {
      setRows(res.data);
      setError(null);
    } else {
      setError(messageFor(res.error));
    }
  }, [cohort.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data load on cohort change
    setRows(null);
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const all = rows ?? [];
    return {
      pending: all.filter((r) => r.status === 'pending').length,
      decided: all.filter((r) => r.status === 'approved' || r.status === 'rejected').length,
      discarded: all.filter((r) => r.status === 'discarded').length,
      all: all.length,
    };
  }, [rows]);

  const filtered = useMemo(
    () => (rows ?? []).filter((r) =>
      filter === 'all' ? true
        : filter === 'decided' ? r.status === 'approved' || r.status === 'rejected'
          : r.status === filter),
    [rows, filter],
  );
  const visible = useSorted(filtered, sort, SORTERS);
  const selectableIds = useMemo(
    () => (readOnly ? [] : visible.filter((r) => r.status === 'pending').map((r) => r.id)),
    [visible, readOnly],
  );
  const sel = useBulkSelection(selectableIds);

  const submit = async () => {
    if (!decision) return;
    setBusy(true);
    const res = await callFor(decision.kind, decision.row.id);
    setBusy(false);
    if (res.ok) {
      setDecision(null);
      setDialogError(null);
      await load();
      await reloadCohorts();
    } else {
      setDialogError(messageFor(res.error));
    }
  };

  const open = (row: PendingRegistration, kind: Kind) => {
    setDialogError(null);
    setDecision({ row, kind });
  };

  const finishBulk = async (s: BulkSummaryData) => {
    setBulk(null);
    setSummary(s);
    sel.clear();
    await load();
    await reloadCohorts();
  };

  const bulkItems = visible
    .filter((r) => sel.selected.includes(r.id))
    .map((r) => ({ id: r.id, label: r.email }));
  const showSelect = !readOnly;
  const colCount = 6 + (showSelect ? 2 : 0);

  const dialogText = (d: Decision) => {
    switch (d.kind) {
      case 'approve': return `Add ${d.row.email} to cohort ${cohort.code} as a student?`;
      case 'reject': return `Reject ${d.row.email}?`;
      case 'discard': return `Discard ${d.row.email}?`;
      case 'restore': return `Restore ${d.row.email} to the pending list?`;
    }
  };
  const verb: Record<Kind, string> = { approve: 'Approve', reject: 'Reject', discard: 'Discard', restore: 'Restore' };
  const heading: Record<Kind, string> = {
    approve: 'Approve registration', reject: 'Reject registration', discard: 'Discard registration', restore: 'Restore registration',
  };

  return (
    <div className="stack">
      <h2>Pending registrations</h2>
      <FilterChips<Filter> label="Show" value={filter} onChange={setFilter} options={[
        { key: 'pending', label: 'Pending', count: counts.pending },
        { key: 'decided', label: 'Decided', count: counts.decided },
        { key: 'discarded', label: 'Discarded', count: counts.discarded },
        { key: 'all', label: 'All', count: counts.all },
      ]} />
      {error ? <p role="alert" className="error">{error}</p> : null}
      {summary ? <BulkSummary summary={summary} onDismiss={() => setSummary(null)} /> : null}
      {!rows && !error ? <p role="status">Loading…</p> : null}
      {rows ? (
        <div className="table-wrap admin-table">
          <table>
            <caption className="sr-only">Pending registrations of cohort {cohort.code}</caption>
            <thead>
              <tr>
                {showSelect ? (
                  <th scope="col" className="c-select">
                    <input type="checkbox" aria-label="Select all pending shown" checked={sel.allSelected}
                      disabled={selectableIds.length === 0} onChange={(e) => sel.setAll(e.target.checked)} />
                  </th>
                ) : null}
                <SortableHeader label="Email" sortKey="email" sort={sort} />
                <SortableHeader label="ID number" sortKey="idnumber" sort={sort} />
                <SortableHeader label="Username" sortKey="username" sort={sort} />
                <SortableHeader label="Name" sortKey="name" sort={sort} />
                <SortableHeader label="Status" sortKey="status" sort={sort} />
                <SortableHeader label="Created" sortKey="created" sort={sort} />
                {showSelect ? <th scope="col"><span className="sr-only">Actions</span></th> : null}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const selected = sel.isSelected(r.id);
                const canSelect = r.status === 'pending';
                return (
                  <tr key={r.id} className={selected && canSelect ? 'is-selected' : undefined}>
                    {showSelect ? (
                      <td className="c-select">
                        {canSelect ? (
                          <input type="checkbox" aria-label={`Select ${r.email}`} checked={selected}
                            onChange={() => sel.toggle(r.id)} />
                        ) : null}
                      </td>
                    ) : null}
                    <td className="c-email">{r.email}</td>
                    <td className="c-index c-mono">{r.idnumber ?? ''}</td>
                    <td className="c-hide-phone">{r.lms_username ?? ''}</td>
                    <td className="c-name">{nameOf(r)}</td>
                    <td className="c-status">{r.status}</td>
                    <td className="c-wide c-muted">{formatColombo(r.created_at)}</td>
                    {showSelect ? (
                      <td className="c-actions">
                        <div className="actions">
                          {r.status === 'pending' ? (
                            <>
                              <button type="button" aria-label={`Approve ${r.email}`} onClick={() => open(r, 'approve')}>Approve</button>
                              <button type="button" aria-label={`Reject ${r.email}`} onClick={() => open(r, 'reject')}>Reject</button>
                            </>
                          ) : null}
                          {r.status === 'pending' || r.status === 'rejected' ? (
                            <RowMenu label={`Actions for ${r.email}`} items={[
                              { label: 'Discard', ariaLabel: `Discard ${r.email}`, danger: true, onSelect: () => open(r, 'discard') },
                            ]} />
                          ) : null}
                          {r.status === 'discarded' ? (
                            <RowMenu label={`Actions for ${r.email}`} items={[
                              { label: 'Restore', ariaLabel: `Restore ${r.email}`, onSelect: () => open(r, 'restore') },
                            ]} />
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
              {visible.length === 0 ? (
                <tr><td colSpan={colCount}>{filter === 'pending' ? 'Nothing waiting.' : 'Nothing to show.'}</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
      {showSelect ? (
        <BulkBar count={sel.selected.length} onClear={sel.clear}>
          <button type="button" onClick={() => setBulk('approve')}>Approve</button>
          <button type="button" onClick={() => setBulk('reject')}>Reject</button>
          <button type="button" onClick={() => setBulk('discard')}>Discard</button>
        </BulkBar>
      ) : null}
      {bulk ? (
        <BulkConfirm
          title={BULK_TEXT[bulk].title}
          submitLabel={BULK_TEXT[bulk].submit}
          body={<p>{BULK_TEXT[bulk].submit} {bulkItems.length} {bulkItems.length === 1 ? 'registration' : 'registrations'}? {BULK_TEXT[bulk].note}</p>}
          items={bulkItems}
          run={(id) => callFor(bulk, id)}
          onCancel={() => setBulk(null)}
          onFinished={(s) => void finishBulk(s)}
        />
      ) : null}
      {decision ? (
        <Dialog
          title={heading[decision.kind]}
          submitLabel={verb[decision.kind]}
          onCancel={() => setDecision(null)}
          onSubmit={() => void submit()}
          busy={busy}
          error={dialogError}
        >
          <p>{dialogText(decision)}</p>
          {decision.kind === 'discard' ? (
            <p>It will be hidden everywhere. Nothing is deleted and it can be restored.</p>
          ) : null}
        </Dialog>
      ) : null}
    </div>
  );
}
