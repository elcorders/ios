import { useCallback, useMemo, useState } from 'react';

/** Selection of row ids, always limited to the ids currently selectable. */
export function useBulkSelection(selectableIds: string[]) {
  const [raw, setRaw] = useState<Set<string>>(new Set());
  const selected = useMemo(() => selectableIds.filter((id) => raw.has(id)), [selectableIds, raw]);
  const toggle = useCallback((id: string) => {
    setRaw((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);
  const setAll = useCallback((on: boolean) => setRaw(on ? new Set(selectableIds) : new Set()), [selectableIds]);
  const clear = useCallback(() => setRaw(new Set()), []);
  const allSelected = selectableIds.length > 0 && selected.length === selectableIds.length;
  return { selected, isSelected: (id: string) => raw.has(id), toggle, setAll, clear, allSelected };
}
