import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import type { SurveyOverview } from '../../api/types';
import { messageFor } from '../../lib/errors';
import { useAdmin } from './AdminContext';
import { GroupCards } from './groups/GroupCards';
import { GroupsChart, GroupsTable, Legend } from './groups/GroupsChart';
import { computeStats } from './groups/groupsData';
import './groups/groups.css';

/** Admin-only view of the survey-derived groups (S7.F2). Read-only. */
export function GroupsPage() {
  const { cohort } = useAdmin();
  const [data, setData] = useState<SurveyOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asTable, setAsTable] = useState(false);
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

  const stats = useMemo(() => (data ? computeStats(data) : null), [data]);

  if (error) return <p role="alert" className="error">{error}</p>;
  if (!data || !stats) return <p role="status">Loading…</p>;

  if (stats.students === 0) {
    return (
      <div className="groups-page stack">
        <p className="gr-empty">No active students in this cohort yet.</p>
      </div>
    );
  }

  return (
    <div className="groups-page stack">
      <div className="gr-stats">
        <div className="gr-stat"><span className="gr-stat-v">{stats.students}</span><span className="gr-stat-l">Students</span></div>
        <div className="gr-stat"><span className="gr-stat-v">{stats.answered}</span><span className="gr-stat-l">Answered</span></div>
        <div className="gr-stat"><span className="gr-stat-v">{stats.groups}</span><span className="gr-stat-l">Groups</span></div>
        <div className="gr-stat"><span className="gr-stat-v">±{stats.balance}</span><span className="gr-stat-l">Balance</span></div>
      </div>

      <section className="card gr-chart-card" aria-labelledby="gr-chart-h">
        <div className="gr-chart-head">
          <h2 id="gr-chart-h">Group sizes</h2>
          <button type="button" aria-pressed={asTable} onClick={() => setAsTable((v) => !v)}>
            {asTable ? 'Show as chart' : 'Show as table'}
          </button>
        </div>
        <Legend />
        {asTable ? <GroupsTable groups={data.groups} /> : <GroupsChart groups={data.groups} max={stats.max} />}
      </section>

      <section aria-labelledby="gr-members-h" className="stack">
        <div className="gr-chart-head">
          <h2 id="gr-members-h">Members by group</h2>
          <div className="field gr-search">
            <label htmlFor="gr-search">Search members</label>
            <input id="gr-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, index no or email" />
          </div>
        </div>
        <GroupCards data={data} query={query} />
      </section>
    </div>
  );
}
