import { useMemo, useState } from 'react';

export type SortDir = 'asc' | 'desc';
type Value = string | number | null | undefined;

export interface SortState<K extends string> {
  key: K;
  dir: SortDir;
  toggle: (key: K) => void;
}

export function useSort<K extends string>(initialKey: K, initialDir: SortDir = 'asc'): SortState<K> {
  const [s, setS] = useState<{ key: K; dir: SortDir }>({ key: initialKey, dir: initialDir });
  const toggle = (key: K) =>
    setS((p) => (p.key === key ? { key, dir: p.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  return { key: s.key, dir: s.dir, toggle };
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** Sort a copy of rows; empty values always go last. */
export function useSorted<T, K extends string>(
  rows: T[],
  sort: Pick<SortState<K>, 'key' | 'dir'>,
  getters: Record<K, (row: T) => Value>,
): T[] {
  const { key, dir } = sort;
  return useMemo(() => {
    const get = getters[key];
    const sign = dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      const xe = x === null || x === undefined || x === '';
      const ye = y === null || y === undefined || y === '';
      if (xe || ye) return xe && ye ? 0 : xe ? 1 : -1;
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * sign;
      return collator.compare(String(x), String(y)) * sign;
    });
    // getters are static per page, deliberately not a dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, key, dir]);
}
