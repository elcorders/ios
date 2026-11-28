import { describe, expect, it } from 'vitest';
import type { ClassTemplate } from '../../api/types';
import {
  applyTemplate, atValue, classesError, droppedSlots, newSlot, notifyText, openText, slotsProblem, toInputSlots, type SlotDraft,
} from './classes/classesHelpers';

const slot = (over: Partial<SlotDraft> = {}): SlotDraft => ({ ...newSlot(0), ...over });
const TPL: ClassTemplate = {
  id: 't', name: 'Day', used_count: 0, updated_at: '2026-11-01T00:00:00+05:30',
  slots: [{ label: 'A', start_time: '09:00', end_time: '11:00' }, { label: 'B', start_time: '11:00', end_time: '13:00' }],
};

describe('slotsProblem / toInputSlots', () => {
  it('ignores empty slots but needs one real slot', () => {
    expect(slotsProblem([slot()], '2099-01-01')).toBe('Pick at least one group in a slot.');
    expect(droppedSlots([slot(), slot({ groups: [1] })])).toBe(1);
    expect(toInputSlots([slot(), slot({ groups: [2, 1], label: ' Lab ' })], '2099-01-01')).toEqual([
      { label: 'Lab', start_time: '09:00', end_time: '12:00', group_nos: [1, 2], content: [] },
    ]);
  });

  it('flags items without groups using the slot label', () => {
    const s = slot({ label: 'Morning', items: [{ id: 'x', notify: 'slot_end', at: '' }] });
    expect(slotsProblem([s], '2099-01-01')).toBe('Pick at least one group for Morning.');
    expect(slotsProblem([slot({ label: ' ', items: [{ id: 'x', notify: 'none', at: '' }] })], '2099-01-01')).toBe('Pick at least one group for Slot 1.');
  });

  it('checks times and the "At…" notification time (default = slot end, converted to +05:30)', () => {
    expect(slotsProblem([slot({ groups: [1], start: '12:00', end: '09:00' })], '2099-01-01')).toBe('End must be after start.');
    const at = (v: string) => slot({ groups: [1], items: [{ id: 'x', notify: 'at', at: v }] });
    expect(slotsProblem([at('2099-01-01T08:00')], '2099-01-01')).toMatch(/not before the slot starts/);
    expect(slotsProblem([at('')], '2099-01-01')).toBeNull();
    expect(atValue('2099-01-01', { end: '12:00' }, { id: 'x', notify: 'at', at: '' })).toBe('2099-01-01T12:00');
    expect(toInputSlots([at('2099-01-01T10:30')], '2099-01-01')[0]!.content).toEqual([
      { content_id: 'x', notify: 'at', notify_at: '2099-01-01T10:30:00+05:30' },
    ]);
    expect(toInputSlots([slot({ groups: [1], items: [{ id: 'x', notify: 'none', at: 'ignored' }] })], '2099-01-01')[0]!.content[0]!.notify_at).toBeNull();
  });
});

describe('applyTemplate', () => {
  it('replaces labels and times, keeping groups and items by position', () => {
    const items = [{ id: 'x', notify: 'slot_end' as const, at: '' }];
    const out = applyTemplate([slot({ groups: [1], items }), slot({ groups: [2] }), slot({ groups: [3] })], TPL);
    expect(out.map((s) => [s.label, s.start, s.end, s.groups])).toEqual([['A', '09:00', '11:00', [1]], ['B', '11:00', '13:00', [2]]]);
    expect(out[0]!.items).toBe(items);
    expect(applyTemplate([slot()], TPL)[1]!.groups).toEqual([]);
  });
});

describe('texts', () => {
  it('describes notifications and openness', () => {
    expect(notifyText({ notify: 'slot_end', notify_at: null, notified: false }, '11:00')).toBe('Notify at 11:00');
    expect(notifyText({ notify: 'none', notify_at: null, notified: false }, '11:00')).toBe('No notification');
    expect(notifyText({ notify: 'at', notify_at: '2026-11-13T09:00:00Z', notified: true }, '11:00')).toBe('Notify 13 Nov 14:30 · sent');
    const slotInfo = { start_time: '09:00', group_nos: [1, 2] };
    expect(openText({ ...slotInfo, starts_at: '2020-01-01T09:00:00+05:30' })).toBe('Open for G1, G2');
    expect(openText({ ...slotInfo, starts_at: '2099-01-01T09:00:00+05:30' })).toBe('Opens 09:00');
  });

  it('maps server hints to messages', () => {
    expect(classesError({ code: 'invalid_input', details: { field: 'notify' } })).toMatch(/notification time/);
    expect(classesError({ code: 'invalid_input', details: 'label' })).toMatch(/40 characters/);
    expect(classesError({ code: 'invalid_input' })).toMatch(/Check the date/);
    expect(classesError({ code: 'conflict' })).toBe('A template with that name already exists.');
  });
});
