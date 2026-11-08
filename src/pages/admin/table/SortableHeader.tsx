import type { SortState } from './useSort';
import './table.css';

interface Props<K extends string> {
  label: string;
  sortKey: K;
  sort: SortState<K>;
  className?: string;
}

export function SortableHeader<K extends string>({ label, sortKey, sort, className }: Props<K>) {
  const active = sort.key === sortKey;
  return (
    <th scope="col" className={className} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="sort-btn" onClick={() => sort.toggle(sortKey)}>
        {label}
        <span aria-hidden="true" className="sort-arrow">{active ? (sort.dir === 'asc' ? '▲' : '▼') : ''}</span>
      </button>
    </th>
  );
}
