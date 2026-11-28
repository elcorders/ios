import { useState } from 'react';
import { api } from '../../../api';
import type { AdminContentRow, ClassSession, ClassTemplate } from '../../../api/types';
import { pushEnabledFor } from '../../../lib/features';
import { Dialog } from '../Dialog';
import { SlotCard } from './SlotCard';
import {
  applyTemplate, classesError, DEFAULT_LAB_UNTIL, draftsFromSession, droppedSlots, labModeOf, labValue, MAX_SLOTS, newSlot, slotsProblem, toInputSlots,
  type LabMode, type SlotDraft,
} from './classesHelpers';

interface Props {
  cohortId: string;
  session: ClassSession | null;
  /** Duplicate: prefill from `session` (same slots and groups, items cleared) as a new class day. */
  duplicate?: boolean;
  /** Group numbers of the cohort. */
  groups: number[];
  content: AdminContentRow[];
  templates: ClassTemplate[];
  onCancel: () => void;
  onDone: () => Promise<void>;
}

export const SLOT_HELP = "Items open for that slot's groups at its start. Other groups get them only when set on their own slot, or when you publish them.";

/** Add / edit / duplicate a class day (§S14, §S24). */
export function ClassDialog({ cohortId, session, duplicate = false, groups, content, templates, onCancel, onDone }: Props) {
  const editing = session !== null && !duplicate;
  const initialMode = labModeOf(session ? session.lab_block_until : DEFAULT_LAB_UNTIL);
  const [date, setDate] = useState(editing ? session.date : '');
  const [title, setTitle] = useState(session?.title ?? '');
  const [templateId, setTemplateId] = useState(session?.template_id ?? '');
  const [slots, setSlots] = useState<SlotDraft[]>(session ? draftsFromSession(session, duplicate) : [newSlot(0)]);
  const [dirty, setDirty] = useState(false);
  const [pendingTpl, setPendingTpl] = useState<ClassTemplate | null>(null);
  const [deliverables, setDeliverables] = useState((session?.deliverables ?? []).join('\n'));
  const [mode, setMode] = useState<LabMode>(initialMode);
  const [until, setUntil] = useState(initialMode === 'time' ? session!.lab_block_until! : '17:00');
  const push = pushEnabledFor(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const edit = (next: SlotDraft[]) => {
    setSlots(next);
    setDirty(true);
  };
  const patchSlot = (i: number, p: Partial<SlotDraft>) => edit(slots.map((x, j) => (j === i ? { ...x, ...p } : x)));

  const pickTemplate = (tpl: ClassTemplate) => {
    setTemplateId(tpl.id);
    setSlots(applyTemplate(slots, tpl));
    setDirty(false);
    setPendingTpl(null);
  };
  const chooseTemplate = (id: string) => {
    setPendingTpl(null);
    if (!id) return setTemplateId('');
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    if (dirty || session !== null) setPendingTpl(tpl);
    else pickTemplate(tpl);
  };

  const submit = async () => {
    if (!date) return setError('Pick a date.');
    if (!title.trim()) return setError('Title is required.');
    const problem = slotsProblem(slots, date);
    if (problem) return setError(problem);
    if (mode === 'time' && !until) return setError('Pick the time the lab block ends.');
    setBusy(true);
    const res = await api.adminUpsertClassSession({
      id: editing ? session.id : null, cohort_id: cohortId, date, title: title.trim(),
      slots: toInputSlots(slots, date),
      deliverables: deliverables.split('\n').map((d) => d.trim()).filter(Boolean),
      lab_block_until: labValue(mode, until), template_id: templateId || null,
    });
    if (res.ok) await onDone();
    else {
      setError(classesError(res.error));
      setBusy(false);
    }
  };

  const dropped = droppedSlots(slots);
  const heading = editing ? 'Edit class day' : duplicate ? 'Duplicate class day' : 'Add class day';

  return (
    <Dialog title={heading} submitLabel="Save" onCancel={onCancel} onSubmit={() => void submit()} busy={busy} error={error} className="dialog-wide">
      <div className="class-top">
        <div className="field">
          <label htmlFor="cl-title">Title</label>
          <input id="cl-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="cl-date">Date</label>
          <input id="cl-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="cl-template">Template (optional)</label>
          <select id="cl-template" value={templateId} onChange={(e) => chooseTemplate(e.target.value)}>
            <option value="">None</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </div>
      {pendingTpl ? (
        <div className="banner confirm" role="group" aria-label="Replace slots">
          <p>Replace the slot labels and times with “{pendingTpl.name}”? Groups and items stay on the same slot numbers. Extra slots are removed.</p>
          <div className="row">
            <button type="button" onClick={() => setPendingTpl(null)}>Keep my slots</button>
            <button type="button" className="primary" onClick={() => pickTemplate(pendingTpl)}>Use template</button>
          </div>
        </div>
      ) : null}
      <div className="slot-stack">
        <h3 className="slots-title">Slots</h3>
        <p className="muted">{SLOT_HELP}</p>
        {slots.map((sl, i) => (
          <SlotCard
            key={sl.key}
            index={i}
            slot={sl}
            date={date}
            groups={groups}
            takenGroups={new Set(slots.flatMap((o, j) => (j === i ? [] : o.groups)))}
            content={content}
            canRemove={slots.length > 1}
            onChange={(p) => patchSlot(i, p)}
            onRemove={() => edit(slots.filter((_, j) => j !== i))}
          />
        ))}
        {slots.length < MAX_SLOTS ? (
          <button type="button" className="slot-add" onClick={() => edit([...slots, newSlot(slots.length, slots[slots.length - 1])])}>+ Add slot</button>
        ) : null}
        <p className="muted">
          Slots with no groups and no items are dropped when you save{dropped > 0 ? ` (${dropped} now)` : ''}.
        </p>
      </div>
      <div className="class-bottom">
        <div className="field class-deliv">
          <label htmlFor="cl-deliv">Deliverables (one per line)</label>
          <textarea id="cl-deliv" rows={3} value={deliverables} onChange={(e) => setDeliverables(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="cl-lab">Lab block</label>
          <select id="cl-lab" value={mode} onChange={(e) => setMode(e.target.value as LabMode)}>
            <option value="default">Until 16:00 (default)</option>
            <option value="time">Until time…</option>
            <option value="whole">Whole day</option>
            <option value="none">Doesn&apos;t block the lab</option>
          </select>
        </div>
        {mode === 'time' ? (
          <div className="field">
            <label htmlFor="cl-until">Lab blocked until</label>
            <input id="cl-until" type="time" value={until} onChange={(e) => setUntil(e.target.value)} />
          </div>
        ) : null}
      </div>
      {push ? <p className="muted">Class reminders go out at 18:00 the evening before, to each slot&apos;s groups.</p> : null}
    </Dialog>
  );
}
