import { useState } from 'react';
import { api } from '../../../api';
import type { AdminContentRow, ClassSession } from '../../../api/types';
import { Dialog } from '../Dialog';
import { classesError, DEFAULT_LAB_UNTIL, labModeOf, labValue, type LabMode } from './classesHelpers';

interface Props {
  cohortId: string;
  session: ClassSession | null;
  /** Group numbers of the cohort. */
  groups: number[];
  content: AdminContentRow[];
  onCancel: () => void;
  onDone: () => Promise<void>;
}

/** Add / edit a class session (§S14). */
export function ClassDialog({ cohortId, session, groups, content, onCancel, onDone }: Props) {
  const initialMode = labModeOf(session ? session.lab_block_until : DEFAULT_LAB_UNTIL);
  const [date, setDate] = useState(session?.date ?? '');
  const [start, setStart] = useState(session?.start_time ?? '09:00');
  const [end, setEnd] = useState(session?.end_time ?? '12:00');
  const [title, setTitle] = useState(session?.title ?? '');
  const [groupNos, setGroupNos] = useState<number[]>(session?.group_nos ?? []);
  const [deliverables, setDeliverables] = useState((session?.deliverables ?? []).join('\n'));
  const [mode, setMode] = useState<LabMode>(initialMode);
  const [until, setUntil] = useState(initialMode === 'time' ? session!.lab_block_until! : '17:00');
  const [linked, setLinked] = useState<string[]>(session?.content.map((c) => c.id) ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const submit = async () => {
    if (!date) return setError('Pick a date.');
    if (!start || !end || start >= end) return setError('The end time must be after the start time.');
    if (!title.trim()) return setError('Title is required.');
    if (groupNos.length === 0) return setError('Choose at least one group.');
    if (mode === 'time' && !until) return setError('Pick the time the lab block ends.');
    setBusy(true);
    const res = await api.adminUpsertClassSession({
      id: session?.id ?? null, cohort_id: cohortId, date, start_time: start, end_time: end, title: title.trim(),
      group_nos: [...groupNos].sort((a, b) => a - b),
      deliverables: deliverables.split('\n').map((d) => d.trim()).filter(Boolean),
      lab_block_until: labValue(mode, until), content_ids: linked,
    });
    if (res.ok) await onDone();
    else {
      setError(classesError(res.error));
      setBusy(false);
    }
  };

  const tutorials = content.filter((c) => c.kind === 'tutorial');
  const materials = content.filter((c) => c.kind === 'material');
  const linkGroup = (label: string, rows: AdminContentRow[]) => (
    <fieldset className="check-list">
      <legend>{label}</legend>
      {rows.length === 0 ? <span className="muted">None yet.</span> : null}
      {rows.map((c) => (
        <label key={c.id}>
          <input type="checkbox" checked={linked.includes(c.id)} onChange={() => setLinked(toggle(linked, c.id))} />
          <span>{c.title} <span className="muted">({c.status.replace('_', ' ')})</span></span>
        </label>
      ))}
    </fieldset>
  );

  return (
    <Dialog title={session ? 'Edit class' : 'Add class'} submitLabel="Save" onCancel={onCancel} onSubmit={() => void submit()} busy={busy} error={error}>
      <div className="field">
        <label htmlFor="cl-title">Title</label>
        <input id="cl-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="class-times">
        <div className="field">
          <label htmlFor="cl-date">Date</label>
          <input id="cl-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="cl-start">Start</label>
          <input id="cl-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="cl-end">End</label>
          <input id="cl-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>
      <fieldset className="check-list">
        <legend>Groups</legend>
        <div className="check-row">
          {groups.map((g) => (
            <label key={g}>
              <input type="checkbox" checked={groupNos.includes(g)} onChange={() => setGroupNos(toggle(groupNos, g))} />
              <span>Group {g}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="field">
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
      {linkGroup('Linked tutorials', tutorials)}
      {linkGroup('Linked materials', materials)}
    </Dialog>
  );
}
