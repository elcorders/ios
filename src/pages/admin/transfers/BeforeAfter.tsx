import type { GroupStat } from '../../../api/types';
import { afterSizes, spread } from './transferLogic';
import './transfers.css';

const pct = (v: number, max: number) => (max > 0 ? Math.min(100, (v / max) * 100) : 0);

/** One group's stacked bar (Has Mac / No Mac / unsurveyed) with a visible number. */
export function SizeBar({ group, max, label }: { group: GroupStat; max: number; label?: string }) {
  const other = Math.max(0, group.size - group.has_mac - group.no_mac);
  return (
    <span className="tr-bar-wrap">
      <span className="tr-bar" aria-hidden="true">
        {group.has_mac > 0 ? <span className="tr-seg tr-has" style={{ width: `${pct(group.has_mac, max)}%` }} /> : null}
        {group.no_mac > 0 ? <span className="tr-seg tr-no" style={{ width: `${pct(group.no_mac, max)}%` }} /> : null}
        {other > 0 ? <span className="tr-seg tr-other" style={{ width: `${pct(other, max)}%` }} /> : null}
      </span>
      <span className="tr-bar-val" aria-label={label}>{group.size}</span>
    </span>
  );
}

export function MacLegend() {
  return (
    <ul className="tr-legend" aria-label="Legend">
      <li><span className="tr-swatch tr-has" aria-hidden="true" /> Has Mac</li>
      <li><span className="tr-swatch tr-no" aria-hidden="true" /> No Mac</li>
    </ul>
  );
}

/** Compact bars for every group. */
export function GroupStrip({ groups }: { groups: GroupStat[] }) {
  const max = Math.max(1, ...groups.map((g) => g.size));
  return (
    <div className="tr-strip" role="list" aria-label="Group sizes">
      {groups.map((g) => (
        <div className="tr-strip-item" role="listitem" key={g.no}
          aria-label={`${g.name}: ${g.size} students, ${g.has_mac} with a Mac, ${g.no_mac} without`}>
          <span className="tr-strip-name">{g.name}</span>
          <SizeBar group={g} max={max} />
        </div>
      ))}
    </div>
  );
}

interface Props {
  groups: GroupStat[];
  /** Null when the student has no group yet (manual placement). */
  from: number | null;
  to: number;
  hasMac: boolean | null;
  warn?: boolean;
  suggested?: boolean;
}

/** Before -> after view of the two groups involved in a move, plus the overall spread. */
export function BeforeAfter({ groups, from, to, hasMac, warn = false, suggested = false }: Props) {
  const after = afterSizes(groups, from, to, hasMac);
  const max = Math.max(1, ...groups.map((g) => g.size), ...after.map((g) => g.size));
  const nos = from === null ? [to] : [from, to];
  const before = spread(groups);
  const afterSpread = spread(after);
  const find = (list: GroupStat[], no: number) => list.find((g) => g.no === no);
  const summary = nos
    .map((no) => `${find(groups, no)?.name ?? `Group ${no}`} ${find(groups, no)?.size ?? 0} to ${find(after, no)?.size ?? 0}`)
    .join(', ');
  const toName = find(groups, to)?.name ?? `Group ${to}`;
  return (
    <div className="tr-scope tr-ba" role="group" aria-label={`Before and after for ${toName}`}>
      <p className="sr-only">{`${summary}. Spread ${before} to ${afterSpread}.`}</p>
      {suggested ? <span className="badge tr-suggested">Suggested</span> : null}
      {nos.map((no) => {
        const b = find(groups, no);
        const a = find(after, no);
        if (!b || !a) return null;
        return (
          <div className="tr-ba-row" key={no}>
            <span className="tr-ba-name">{b.name}</span>
            <SizeBar group={b} max={max} label={`${b.name} now ${b.size}`} />
            <span aria-hidden="true" className="tr-arrow">→</span>
            <SizeBar group={a} max={max} label={`${a.name} after ${a.size}`} />
          </div>
        );
      })}
      <p className="tr-spread">Spread (largest − smallest): {before} → {afterSpread}</p>
      {warn ? <p className="tr-warn" role="note">{`${toName} would be 2+ bigger than the smallest`}</p> : null}
    </div>
  );
}
