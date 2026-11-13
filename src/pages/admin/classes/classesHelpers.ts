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

export const MAX_SLOTS = 6;

export interface SlotDraft {
  start: string;
  end: string;
  groups: number[];
}

export const newSlot = (): SlotDraft => ({ start: '09:00', end: '12:00', groups: [] });

/** First validation problem of the slot drafts, or null. */
export function slotsProblem(slots: SlotDraft[]): string | null {
  if (slots.some((s) => !s.start || !s.end || s.start >= s.end)) return 'End must be after start.';
  if (slots.some((s) => s.groups.length === 0)) return 'Each slot needs at least one group.';
  return null;
}

/** One line per slot: "09:00–12:00 · G1, G2". */
export function slotText(s: { start_time: string; end_time: string; group_nos: number[] }): string {
  return `${s.start_time}–${s.end_time} · ${s.group_nos.map((g) => `G${g}`).join(', ')}`;
}

export function groupsText(nos: number[]): string {
  return nos.length ? `Group${nos.length > 1 ? 's' : ''} ${nos.join(', ')}` : 'No groups';
}

export const isUpcoming = (s: ClassSession, now = Date.now()): boolean => Date.parse(s.ends_at) > now;

const SPECIFIC: Record<string, string> = {
  cohort_archived: 'This cohort is archived, so its class sessions cannot be changed.',
  invalid_input: 'Check the date, title, time slots (start before end, each with at least one group, no group twice) and linked items.',
};

export function classesError(error: { code: string }): string {
  return SPECIFIC[error.code] ?? messageFor(error);
}
