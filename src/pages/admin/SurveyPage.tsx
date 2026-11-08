import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import type { SurveyOverview } from '../../api/types';
import { messageFor } from '../../lib/errors';
import { useAdmin } from './AdminContext';
import { Dialog } from './Dialog';
import { BulkBar } from './table/BulkBar';
import { useBulkSelection } from './table/useBulkSelection';

type Filter = 'all' | 'unanswered' | 'mac' | 'nomac';

/** Survey overview for the selected cohort (S2.F2) + reset answers (S10). */
export function SurveyPage() {
  const { cohort, readOnly } = useAdmin();
  const [data, setData] = useState<SurveyOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api.adminListSurvey(cohort.id);
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

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.rows ?? [])
      .filter((r) =>
        filter === 'all' ||
        (filter === 'unanswered' && r.has_mac === null) ||
        (filter === 'mac' && r.has_mac === true) ||
        (filter === 'nomac' && r.has_mac === false),
      )
      .filter((r) =>
        !q || [r.index_no, r.first_name, r.last_name, `${r.first_name} ${r.last_name}`, r.email]
          .some((v) => v?.toLowerCase().includes(q)),
      );
  }, [data, filter, query]);

  // Only answered rows can be reset; archived cohorts are read-only.
  const selectableIds = useMemo(
    () => (readOnly ? [] : rows.filter((r) => r.has_mac !== null).map((r) => r.enrolment_id)),
    [rows, readOnly],
  );
  const sel = useBulkSelection(selectableIds);
  const showSelect = !readOnly;
  const colCount = 5 + (showSelect ? 1 : 0);

  const reset = async () => {
    setBusy(true);
    const res = await api.adminResetSurvey(cohort.id, sel.selected);
    setBusy(false);
    if (!res.ok) {
      setDialogError(messageFor(res.error));
      return;
    }
    setConfirming(false);
    setDialogError(null);
    sel.clear();
    setNotice(`Reset ${res.data.reset} ${res.data.reset === 1 ? 'answer' : 'answers'}. They keep their group and must answer again.`);
    await load();
  };

  return (
    <div className="stack">
      <h2>Survey</h2>
      {error ? <p role="alert" className="error">{error}</p> : null}
      {notice ? (
        <div role="status" className="bulk-summary">
          <p>{notice}</p>
          <button type="button" className="link" onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      ) : null}
      {!data && !error ? <p role="status">Loading…</p> : null}
      {data ? (
        <>
          <p>
            <span className="badge">Answered {data.counts.answered} / {data.counts.students}</span>{' '}
            <span className="badge">Has Mac {data.counts.has_mac}</span>{' '}
            <span className="badge">No Mac {data.counts.no_mac}</span>
          </p>
          <div className="table-wrap">
            <table>
              <caption className="sr-only">Groups of cohort {cohort.code}</caption>
              <thead>
                <tr>
                  <th scope="col">No</th>
                  <th scope="col">Name</th>
                  <th scope="col">Size</th>
                  <th scope="col">Has Mac</th>
                  <th scope="col">No Mac</th>
                </tr>
              </thead>
              <tbody>
                {data.groups.map((g) => (
                  <tr key={g.no}>
                    <td>{g.no}</td>
                    <td>{g.name}</td>
                    <td>{g.size}</td>
                    <td>{g.has_mac}</td>
                    <td>{g.no_mac}</td>
                  </tr>
                ))}
                {data.groups.length === 0 ? <tr><td colSpan={5}>No groups yet.</td></tr> : null}
              </tbody>
            </table>
          </div>
          <div className="toolbar">
            <div className="field">
              <label htmlFor="survey-search">Search</label>
              <input id="survey-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="survey-filter">Show</label>
              <select id="survey-filter" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
                <option value="all">All</option>
                <option value="unanswered">Not answered</option>
                <option value="mac">Has Mac</option>
                <option value="nomac">No Mac</option>
              </select>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <caption className="sr-only">Survey answers of cohort {cohort.code}</caption>
              <thead>
                <tr>
                  {showSelect ? (
                    <th scope="col" className="c-select">
                      <input type="checkbox" aria-label="Select all answered shown" checked={sel.allSelected}
                        disabled={selectableIds.length === 0} onChange={(e) => sel.setAll(e.target.checked)} />
                    </th>
                  ) : null}
                  <th scope="col">Index no</th>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Has Mac</th>
                  <th scope="col">Group</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.enrolment_id} className={sel.isSelected(r.enrolment_id) && r.has_mac !== null ? 'is-selected' : undefined}>
                    {showSelect ? (
                      <td className="c-select">
                        {r.has_mac !== null ? (
                          <input type="checkbox" aria-label={`Select ${r.email}`} checked={sel.isSelected(r.enrolment_id)}
                            onChange={() => sel.toggle(r.enrolment_id)} />
                        ) : null}
                      </td>
                    ) : null}
                    <td>{r.index_no ?? ''}</td>
                    <td>{`${r.first_name} ${r.last_name}`.trim()}</td>
                    <td>{r.email}</td>
                    <td>{r.has_mac === null ? '—' : r.has_mac ? 'Yes' : 'No'}</td>
                    <td>{r.group_no ?? '—'}</td>
                  </tr>
                ))}
                {rows.length === 0 ? <tr><td colSpan={colCount}>No matching students.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
      {showSelect ? (
        <BulkBar count={sel.selected.length} onClear={sel.clear}>
          <button type="button" onClick={() => { setDialogError(null); setConfirming(true); }}>
            Reset answer
          </button>
        </BulkBar>
      ) : null}
      {confirming ? (
        <Dialog
          title="Reset survey answers"
          submitLabel="Reset"
          onCancel={() => setConfirming(false)}
          onSubmit={() => void reset()}
          busy={busy}
          error={dialogError}
        >
          <p>
            Reset the Mac answer of {sel.selected.length} {sel.selected.length === 1 ? 'student' : 'students'}?
          </p>
          <p>They keep their group and must answer the survey again the next time they open the site. No email is sent.</p>
        </Dialog>
      ) : null}
    </div>
  );
}
