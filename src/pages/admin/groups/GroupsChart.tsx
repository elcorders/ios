import { useState } from 'react';
import { axisTicks, pct, type GroupInfo } from './groupsData';

type Seg = 'has' | 'no';

/** Segment label shows its count inside only when the segment is at least this wide (% of scale). */
const MIN_LABEL_PCT = 9;

function segText(g: GroupInfo, seg: Seg): string {
  return `${g.name} · ${seg === 'has' ? 'Has Mac' : 'No Mac'}: ${seg === 'has' ? g.has_mac : g.no_mac} of ${g.size}`;
}

export function Legend() {
  return (
    <ul className="gr-legend" aria-label="Legend">
      <li>
        <span className="gr-swatch gr-has" aria-hidden="true" /> Has Mac
      </li>
      <li>
        <span className="gr-swatch gr-no" aria-hidden="true" /> No Mac
      </li>
    </ul>
  );
}

/** Horizontal stacked bars, one row per group, one shared x scale. Pure HTML/CSS. */
export function GroupsChart({ groups, max }: { groups: GroupInfo[]; max: number }) {
  const [tip, setTip] = useState<{ group: number; seg: Seg } | null>(null);
  const ticks = axisTicks(max);
  const scaleMax = Math.max(max, 1);

  const segment = (g: GroupInfo, seg: Seg) => {
    const value = seg === 'has' ? g.has_mac : g.no_mac;
    if (value <= 0) return null;
    const w = pct(value, scaleMax);
    const first = seg === 'has' || g.has_mac === 0;
    const last = seg === 'no' || g.no_mac === 0;
    const open = tip?.group === g.no && tip.seg === seg;
    return (
      <span
        key={seg}
        className={`gr-seg${open ? ' is-open' : ''}`}
        style={{ width: `${w}%` }}
        tabIndex={0}
        role="img"
        aria-label={segText(g, seg)}
        data-testid={`seg-${g.no}-${seg}`}
        onMouseEnter={() => setTip({ group: g.no, seg })}
        onMouseLeave={() => setTip(null)}
        onFocus={() => setTip({ group: g.no, seg })}
        onBlur={() => setTip(null)}
      >
        <span
          className={`gr-mark ${seg === 'has' ? 'gr-has' : 'gr-no'}${first ? ' gr-first' : ''}${last ? ' gr-last' : ''}${seg === 'no' && g.has_mac > 0 ? ' gr-gap' : ''}`}
        >
          {w >= MIN_LABEL_PCT ? <span className="gr-count">{value}</span> : null}
        </span>
        {open ? (
          <span role="tooltip" className="gr-tip">
            {segText(g, seg)}
          </span>
        ) : null}
      </span>
    );
  };

  return (
    <div className="gr-chart" role="group" aria-label="Students per group">
      {groups.map((g) => (
        <div className="gr-row" key={g.no} data-testid={`row-${g.no}`}>
          <span className="gr-name">{g.name}</span>
          <div className="gr-track">
            {ticks.map((t) => (
              <span key={t} className="gr-grid" style={{ left: `${pct(t, scaleMax)}%` }} aria-hidden="true" />
            ))}
            <div className="gr-bar">
              {segment(g, 'has')}
              {segment(g, 'no')}
            </div>
          </div>
          <span className="gr-total">{g.size}</span>
        </div>
      ))}
      <div className="gr-row gr-axis" aria-hidden="true">
        <span className="gr-name" />
        <div className="gr-track gr-axis-track">
          {ticks.map((t) => (
            <span key={t} className="gr-tick" style={{ left: `${pct(t, scaleMax)}%` }}>
              {t}
            </span>
          ))}
        </div>
        <span className="gr-total" />
      </div>
    </div>
  );
}

export function GroupsTable({ groups }: { groups: GroupInfo[] }) {
  return (
    <div className="gr-table-wrap">
      <table className="gr-table">
        <caption className="sr-only">Students per group by Mac answer</caption>
        <thead>
          <tr>
            <th scope="col">Group</th>
            <th scope="col">Has Mac</th>
            <th scope="col">No Mac</th>
            <th scope="col">Total</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.no}>
              <th scope="row">{g.name}</th>
              <td>{g.has_mac}</td>
              <td>{g.no_mac}</td>
              <td>{g.size}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
