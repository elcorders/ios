import type { FullnessLevel, LabDay } from '../../../api/types';

export const LEVEL_LABEL: Record<FullnessLevel, string> = {
  quiet: 'Quiet',
  filling: 'Filling',
  almost_full: 'Almost full',
  full: 'Full',
};

/** "Class until 16:00", or "Class day" when the whole day is blocked ("24:00"). */
export function blockText(until: string | null, whole = 'Class day'): string | null {
  if (!until) return null;
  return until === '24:00' ? whole : `Class until ${until.slice(0, 5)}`;
}

/** An open day whose every slot is blocked by class sessions. */
export const isClassDay = (d: LabDay): boolean => d.open && d.slots.length > 0 && d.slots.every((s) => s.blocked);
