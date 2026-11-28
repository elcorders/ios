import type { ApiError, ClassSession, ClassSessionInput, ClassTemplate, SlotNotify } from '../../../api/types';
import { colomboLocalToIso, isoToColomboLocal } from '../../../lib/colomboLocal';
import { hintOf, messageFor } from '../../../lib/errors';
import { formatColombo } from '../../../lib/time';

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

/** A tutorial/material on a slot, as edited in the dialog. */
export interface ItemDraft {
  id: string;
  notify: SlotNotify;
  /** Colombo `datetime-local` value; '' = the slot's end (default for "At…"). */
  at: string;
}

export interface SlotDraft {
  /** Stable React key. */
  key: number;
  label: string;
  start: string;
  end: string;
  groups: number[];
  items: ItemDraft[];
}

let keySeq = 0;

export function newSlot(position = 0, prev?: SlotDraft): SlotDraft {
  let start = '09:00';
  let end = '12:00';
  if (prev && prev.end < '22:00') {
    start = prev.end;
    const h = Number(prev.end.slice(0, 2)) + 2;
    end = `${String(h).padStart(2, '0')}:${prev.end.slice(3)}`;
  }
  return { key: ++keySeq, label: `Slot ${position + 1}`, start, end, groups: [], items: [] };
}

export const slotName = (s: Pick<SlotDraft, 'label'>, index: number): string => s.label.trim() || `Slot ${index + 1}`;

const hasContent = (s: SlotDraft) => s.groups.length > 0 || s.items.length > 0;

/** Drafts from a saved session; `clearItems` for Duplicate (same slots and groups, no items). */
export function draftsFromSession(session: ClassSession, clearItems = false): SlotDraft[] {
  return session.slots.map((x, i) => ({
    key: ++keySeq,
    label: x.label ?? `Slot ${i + 1}`,
    start: x.start_time,
    end: x.end_time,
    groups: [...x.group_nos],
    items: clearItems
      ? []
      : x.content.map((c) => ({ id: c.id, notify: c.notify, at: c.notify === 'at' && c.notify_at ? isoToColomboLocal(c.notify_at) : '' })),
  }));
}

/** Apply a template: labels and times replaced; groups and items kept by position (extra slots dropped, missing ones empty). */
export function applyTemplate(slots: SlotDraft[], tpl: ClassTemplate): SlotDraft[] {
  return tpl.slots.map((t, i) => ({
    key: slots[i]?.key ?? ++keySeq,
    label: t.label,
    start: t.start_time,
    end: t.end_time,
    groups: slots[i]?.groups ?? [],
    items: slots[i]?.items ?? [],
  }));
}

/** The value shown in an item's "At…" picker. */
export const atValue = (date: string, slot: Pick<SlotDraft, 'end'>, item: ItemDraft): string =>
  item.at || (date ? `${date}T${slot.end}` : '');

/** First validation problem of the slot drafts (empty slots are ignored: they're dropped on save), or null. */
export function slotsProblem(slots: SlotDraft[], date: string): string | null {
  const kept = slots.map((s, i) => ({ s, i })).filter((x) => hasContent(x.s));
  if (kept.length === 0) return 'Pick at least one group in a slot.';
  for (const { s, i } of kept) {
    if (s.groups.length === 0) return `Pick at least one group for ${slotName(s, i)}.`;
    if (!s.start || !s.end || s.start >= s.end) return 'End must be after start.';
    for (const it of s.items) {
      if (it.notify !== 'at') continue;
      const iso = colomboLocalToIso(atValue(date, s, it));
      if (!iso || Date.parse(iso) < Date.parse(colomboLocalToIso(`${date}T${s.start}`) ?? '')) {
        return `${slotName(s, i)}: pick a notification time that is not before the slot starts.`;
      }
    }
  }
  return null;
}

export const droppedSlots = (slots: SlotDraft[]): number => slots.filter((s) => !hasContent(s)).length;

/** The `slots` of the upsert input (empty slots dropped). Call after `slotsProblem` returned null. */
export function toInputSlots(slots: SlotDraft[], date: string): ClassSessionInput['slots'] {
  return slots.filter(hasContent).map((s) => ({
    label: s.label.trim() || null,
    start_time: s.start,
    end_time: s.end,
    group_nos: [...s.groups].sort((a, b) => a - b),
    content: s.items.map((it) => ({
      content_id: it.id,
      notify: it.notify,
      notify_at: it.notify === 'at' ? colomboLocalToIso(atValue(date, s, it)) : null,
    })),
  }));
}

export const NOTIFY_LABELS: Record<SlotNotify, string> = { slot_end: 'At slot end', at: 'At…', none: "Don't notify" };

const hm = (iso: string) => formatColombo(iso, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const dm = (iso: string) => formatColombo(iso, { day: '2-digit', month: 'short' });

/** "Notify at 11:00" / "Notify 18 Nov 14:30" / "No notification", plus "· sent". */
export function notifyText(c: { notify: SlotNotify; notify_at: string | null; notified: boolean }, slotEnd: string): string {
  const base =
    c.notify === 'none' ? 'No notification' : c.notify === 'at' && c.notify_at ? `Notify ${dm(c.notify_at)} ${hm(c.notify_at)}` : `Notify at ${slotEnd}`;
  return c.notified ? `${base} · sent` : base;
}

/** Item status on a card: "Open for G1, G2" once the slot started, else "Opens 09:00". */
export function openText(slot: { starts_at: string; start_time: string; group_nos: number[] }, now = Date.now()): string {
  return Date.parse(slot.starts_at) <= now ? `Open for ${slot.group_nos.map((g) => `G${g}`).join(', ')}` : `Opens ${slot.start_time}`;
}

/** "Slot 1 · 09:00–12:00 · G1, G2". */
export function slotText(s: { label?: string | null; start_time: string; end_time: string; group_nos: number[] }, index = 0): string {
  return `${s.label ?? `Slot ${index + 1}`} · ${s.start_time}–${s.end_time} · ${s.group_nos.map((g) => `G${g}`).join(', ')}`;
}

export const templateSlotsText = (t: Pick<ClassTemplate, 'slots'>): string =>
  t.slots.map((s) => `${s.label} ${s.start_time}–${s.end_time}`).join(' · ');

export const isUpcoming = (s: ClassSession, now = Date.now()): boolean => Date.parse(s.ends_at) > now;

const HINTS: Record<string, string> = {
  title: 'Add a title (up to 200 characters).',
  date: 'Pick a valid date.',
  slots: 'A class day needs 1 to 6 slots.',
  time: 'Check the slot times: each end must be after its start.',
  groups: 'Each slot needs at least one group, and a group can be in only one slot.',
  label: 'Slot labels can be up to 40 characters.',
  content: 'One of the items is unknown, from another cohort, or added twice to the same slot.',
  notify: 'Check the notification time: it cannot be before the slot starts.',
  template: 'That template no longer exists. Pick another one or choose None.',
  name: 'Give the template a name (up to 80 characters).',
  deliverables: 'Up to 20 deliverables, each up to 300 characters.',
  lab_block_until: 'Check the lab block time.',
};

const SPECIFIC: Record<string, string> = {
  cohort_archived: 'This cohort is archived, so its class sessions cannot be changed.',
  invalid_input: 'Check the date, title, slots (end after start, each with a group, no group twice) and items.',
  conflict: 'A template with that name already exists.',
};

export function classesError(error: ApiError | { code: string; details?: unknown }): string {
  if (error.code === 'invalid_input') {
    const h = hintOf(error);
    if (h && HINTS[h]) return HINTS[h];
  }
  return SPECIFIC[error.code] ?? messageFor(error);
}
