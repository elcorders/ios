import './table.css';

export interface ChipOption<K extends string> {
  key: K;
  label: string;
  count: number;
}

interface Props<K extends string> {
  label: string;
  options: ChipOption<K>[];
  value: K;
  onChange: (key: K) => void;
}

/** Single-choice filter chips, each with a count. */
export function FilterChips<K extends string>({ label, options, value, onChange }: Props<K>) {
  return (
    <div role="group" aria-label={label} className="chips">
      {options.map((o) => (
        <button key={o.key} type="button" className="chip" aria-pressed={o.key === value} onClick={() => onChange(o.key)}>
          {o.label} <span className="chip-count">{o.count}</span>
        </button>
      ))}
    </div>
  );
}
