import type { SurveyOverview, SurveyOverviewRow } from '../../../api/types';
import { fullName, matchesQuery, pct } from './groupsData';

function MacBadge({ value }: { value: boolean | null }) {
  if (value === null) return <span className="gr-badge gr-badge-none">Not answered</span>;
  return value ? (
    <span className="gr-badge gr-badge-has"><span aria-hidden="true">● </span>Has Mac</span>
  ) : (
    <span className="gr-badge gr-badge-no"><span aria-hidden="true">▲ </span>No Mac</span>
  );
}

function Members({ rows }: { rows: SurveyOverviewRow[] }) {
  if (!rows.length) return <p className="gr-muted">No members.</p>;
  return (
    <ul className="gr-members">
      {rows.map((r) => (
        <li key={r.enrolment_id}>
          <span className="gr-member-main">
            <span className="gr-member-name">{fullName(r)}</span>
            <span className="gr-member-idx">{r.index_no ?? '—'}</span>
          </span>
          <MacBadge value={r.has_mac} />
        </li>
      ))}
    </ul>
  );
}

export function GroupCards({ data, query }: { data: SurveyOverview; query: string }) {
  const q = query.trim().toLowerCase();
  const byName = (a: SurveyOverviewRow, b: SurveyOverviewRow) => fullName(a).localeCompare(fullName(b));
  const cards = data.groups.map((g) => ({
    g,
    members: data.rows.filter((r) => r.group_no === g.no && matchesQuery(r, q)).sort(byName),
  }));
  const unassigned = data.rows.filter((r) => r.group_no === null && matchesQuery(r, q)).sort(byName);
  const visible = cards.filter((c) => !q || c.members.length > 0);
  const showUnassigned = !q || unassigned.length > 0;

  if (q && !visible.length && !showUnassigned) return <p role="status" className="gr-muted">No members match.</p>;

  return (
    <div className="gr-cards">
      {visible.map(({ g, members }) => (
        <section key={g.no} className="gr-card" aria-label={g.name}>
          <header className="gr-card-head">
            <h3>{g.name}</h3>
            <span className="gr-muted">{g.size} students</span>
          </header>
          <div
            className="gr-mini"
            role="img"
            aria-label={`${g.name}: ${g.has_mac} Has Mac, ${g.no_mac} No Mac`}
          >
            {g.has_mac > 0 ? <span className="gr-has" style={{ width: `${pct(g.has_mac, g.size)}%` }} /> : null}
            {g.no_mac > 0 ? <span className="gr-no" style={{ width: `${pct(g.no_mac, g.size)}%` }} /> : null}
          </div>
          <Members rows={members} />
        </section>
      ))}
      {showUnassigned ? (
        <section className="gr-card gr-card-unassigned" aria-label="Unassigned / not answered">
          <header className="gr-card-head">
            <h3>Unassigned / not answered</h3>
            <span className="gr-muted">{unassigned.length} students</span>
          </header>
          <Members rows={unassigned} />
        </section>
      ) : null}
    </div>
  );
}
