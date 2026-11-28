import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../api';
import type { ClassTemplate } from '../../../api/types';
import { Dialog } from '../Dialog';
import { classesError, MAX_SLOTS, templateSlotsText } from './classesHelpers';

interface Props {
  onClose: () => void;
  /** Called after any create / edit / delete so the page can refresh its template list. */
  onChanged: () => void;
}

type View = { type: 'list' } | { type: 'edit'; template: ClassTemplate | null } | { type: 'delete'; template: ClassTemplate };

interface SlotRow { key: number; label: string; start: string; end: string }
let rowSeq = 0;

/** Class templates (§S24): list, create, edit, delete. Shared by all cohorts. */
export function TemplatesDialog({ onClose, onChanged }: Props) {
  const [templates, setTemplates] = useState<ClassTemplate[] | null>(null);
  const [view, setView] = useState<View>({ type: 'list' });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await api.adminListClassTemplates();
    if (r.ok) {
      setTemplates(r.data);
      setError(null);
    } else setError(classesError(r.error));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    void load();
  }, [load]);

  const back = async () => {
    onChanged();
    await load();
    setView({ type: 'list' });
  };

  if (view.type === 'edit') return <EditTemplate template={view.template} onCancel={() => setView({ type: 'list' })} onDone={back} />;
  if (view.type === 'delete') return <DeleteTemplate template={view.template} onCancel={() => setView({ type: 'list' })} onDone={back} />;

  return (
    <Dialog title="Class templates" submitLabel="Done" hideCancel onCancel={onClose} onSubmit={onClose} error={error}>
      <p className="muted">A template is a set of named slots with times, e.g. Slot 1 09:00–11:00. They are shared by all cohorts.</p>
      {templates === null ? <p role="status">Loading…</p> : null}
      {templates?.length === 0 ? <p className="muted">No templates yet.</p> : null}
      <ul className="template-list">
        {templates?.map((t) => (
          <li key={t.id} className="template-item" aria-label={t.name}>
            <div>
              <strong>{t.name}</strong>
              <p className="muted">{templateSlotsText(t)}</p>
              <p className="muted">{t.used_count === 0 ? 'Not used yet' : `Used by ${t.used_count} class day${t.used_count === 1 ? '' : 's'}`}</p>
            </div>
            <div className="class-actions">
              <button type="button" aria-label={`Edit template ${t.name}`} onClick={() => setView({ type: 'edit', template: t })}>Edit</button>
              <button type="button" aria-label={`Delete template ${t.name}`} onClick={() => setView({ type: 'delete', template: t })}>Delete</button>
            </div>
          </li>
        ))}
      </ul>
      <button type="button" className="slot-add" onClick={() => setView({ type: 'edit', template: null })}>New template</button>
    </Dialog>
  );
}

function EditTemplate({ template, onCancel, onDone }: { template: ClassTemplate | null; onCancel: () => void; onDone: () => Promise<void> }) {
  const [name, setName] = useState(template?.name ?? '');
  const [rows, setRows] = useState<SlotRow[]>(
    template
      ? template.slots.map((s) => ({ key: ++rowSeq, label: s.label, start: s.start_time, end: s.end_time }))
      : [{ key: ++rowSeq, label: 'Slot 1', start: '09:00', end: '11:00' }],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const patch = (key: number, p: Partial<SlotRow>) => setRows(rows.map((r) => (r.key === key ? { ...r, ...p } : r)));

  const submit = async () => {
    if (!name.trim()) return setError('Give the template a name.');
    if (rows.some((r) => !r.label.trim())) return setError('Every slot needs a label.');
    if (rows.some((r) => !r.start || !r.end || r.start >= r.end)) return setError('End must be after start.');
    setError(null);
    setBusy(true);
    const res = await api.adminUpsertClassTemplate({
      id: template?.id ?? null, name: name.trim(),
      slots: rows.map((r) => ({ label: r.label.trim(), start_time: r.start, end_time: r.end })),
    });
    if (res.ok) await onDone();
    else {
      setError(classesError(res.error));
      setBusy(false);
    }
  };

  return (
    <Dialog title={template ? 'Edit template' : 'New template'} submitLabel="Save" onCancel={onCancel} onSubmit={() => void submit()} busy={busy} error={error}>
      <div className="field">
        <label htmlFor="tp-name">Template name</label>
        <input id="tp-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      </div>
      {rows.map((r, i) => (
        <fieldset key={r.key} className="slot-card" aria-label={`Template slot ${i + 1}`}>
          <div className="slot-head">
            <strong>Slot {i + 1}</strong>
            {rows.length > 1 ? (
              <button type="button" className="slot-remove" aria-label={`Remove template slot ${i + 1}`} onClick={() => setRows(rows.filter((x) => x.key !== r.key))}>Remove</button>
            ) : null}
          </div>
          <div className="slot-fields">
            <div className="field">
              <label htmlFor={`tp-label-${r.key}`}>Label</label>
              <input id={`tp-label-${r.key}`} value={r.label} maxLength={40} onChange={(e) => patch(r.key, { label: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor={`tp-start-${r.key}`}>Start</label>
              <input id={`tp-start-${r.key}`} type="time" value={r.start} onChange={(e) => patch(r.key, { start: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor={`tp-end-${r.key}`}>End</label>
              <input id={`tp-end-${r.key}`} type="time" value={r.end} onChange={(e) => patch(r.key, { end: e.target.value })} />
            </div>
          </div>
        </fieldset>
      ))}
      {rows.length < MAX_SLOTS ? (
        <button
          type="button"
          className="slot-add"
          onClick={() => setRows([...rows, { key: ++rowSeq, label: `Slot ${rows.length + 1}`, start: rows[rows.length - 1]?.end ?? '09:00', end: '23:00' }])}
        >+ Add slot</button>
      ) : null}
    </Dialog>
  );
}

function DeleteTemplate({ template, onCancel, onDone }: { template: ClassTemplate; onCancel: () => void; onDone: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    const res = await api.adminDeleteClassTemplate(template.id);
    if (res.ok) await onDone();
    else {
      setError(classesError(res.error));
      setBusy(false);
    }
  };
  return (
    <Dialog title="Delete template" submitLabel="Delete" onCancel={onCancel} onSubmit={() => void submit()} busy={busy} error={error}>
      <p>Delete the template “{template.name}”? Classes keep their times.</p>
    </Dialog>
  );
}
