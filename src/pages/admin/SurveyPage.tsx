import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import type { SurveyOverview } from '../../api/types';
import { messageFor } from '../../lib/errors';
import { useAdmin } from './AdminContext';

type Filter = 'all' | 'unanswered' | 'mac' | 'nomac';

/** Read-only survey overview for the selected cohort (S2.F2). */
export function SurveyPage() {
  const { cohort } = useAdmin();
  const [data, setData] = useState<SurveyOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

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

  return (
    <div className="stack">
      <h2>Survey</h2>
      {error ? <p role="alert" className="error">{error}</p> : null}
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
                  <th scope="col">Index no</th>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Has Mac</th>
                  <th scope="col">Group</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.enrolment_id}>
                    <td>{r.index_no ?? ''}</td>
                    <td>{`${r.first_name} ${r.last_name}`.trim()}</td>
                    <td>{r.email}</td>
                    <td>{r.has_mac === null ? '—' : r.has_mac ? 'Yes' : 'No'}</td>
                    <td>{r.group_no ?? '—'}</td>
                  </tr>
                ))}
                {rows.length === 0 ? <tr><td colSpan={5}>No matching students.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
