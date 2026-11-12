import type { ClassSession } from '../../../api/types';
import { messageFor } from '../../../lib/errors';

export type LabMode = 'default' | 'time' | 'whole' | 'none';

export const DEFAULT_LAB_UNTIL = '16:00';

export function labModeOf(until: string | null): LabMode {
  if (until === null) return 'none';
  if (until === '24:00') return 'whole';
  return until === DEFAULT_LAB_UNTIL ? 'default' : 'time';
}

/** The `lab_block_until` value for the form state. */
export function labValue(mode: LabMode, time: string): string | null {
  if (mode === 'none') return null;
  if (mode === 'whole') return '24:00';
  return mode === 'time' ? time : DEFAULT_LAB_UNTIL;
}

export function labText(until: string | null): string {
  if (until === null) return "Doesn't block the lab";
  if (until === '24:00') return 'Lab blocked all day';
  return `Lab blocked until ${until}`;
}

export function groupsText(nos: number[]): string {
  return nos.length ? `Group${nos.length > 1 ? 's' : ''} ${nos.join(', ')}` : 'No groups';
}

export const isUpcoming = (s: ClassSession, now = Date.now()): boolean => Date.parse(s.ends_at) > now;

const SPECIFIC: Record<string, string> = {
  cohort_archived: 'This cohort is archived, so its class sessions cannot be changed.',
  invalid_input: 'Check the date, times (start before end), title, groups (at least one) and linked items.',
};

export function classesError(error: { code: string }): string {
  return SPECIFIC[error.code] ?? messageFor(error);
}
