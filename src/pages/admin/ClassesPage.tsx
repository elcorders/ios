import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import type { AdminContentRow, ClassSession } from '../../api/types';
import { formatColombo } from '../../lib/time';
import { useAdmin } from './AdminContext';
import { Dialog } from './Dialog';
import { ClassDialog } from './classes/ClassDialog';
import { classesError, isUpcoming, labText, slotText } from './classes/classesHelpers';
import './content.css';
import './classes.css';

type Dlg = { type: 'edit'; session: ClassSession | null } | { type: 'delete'; session: ClassSession };

const longDate = (iso: string) => formatColombo(iso, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });

/** Admin › Classes (§S14): class sessions of the selected cohort. */
export function ClassesPage() {
  const { cohort, readOnly } = useAdmin();
  const [sessions, setSessions] = useState<ClassSession[] | null>(null);
  const [groups, setGroups] = useState<number[]>([]);
  const [content, setContent] = useState<AdminContentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dlg, setDlg] = useState<Dlg | null>(null);

  const load = useCallback(async () => {
    const [s, g, t, m] = await Promise.all([
      api.adminListClassSessions(cohort.id),
      api.adminListSurvey(cohort.id),
      api.adminListContent('tutorial', cohort.id),
      api.adminListContent('material', cohort.id),
    ]);
    if (s.ok) {
      setSessions(s.data);
      setError(null);
    } else setError(classesError(s.error));
    if (g.ok) setGroups(g.data.groups.map((x) => x.no));
    setContent([...(t.ok ? t.data : []), ...(m.ok ? m.data : [])]);
  }, [cohort.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    void load();
  }, [load]);

  const done = async (msg: string) => {
    setDlg(null);
    setNotice(msg);
    await load();
  };

  const { upcoming, past } = useMemo(() => {
    const all = sessions ?? [];
    return { upcoming: all.filter((s) => isUpcoming(s)), past: all.filter((s) => !isUpcoming(s)).reverse() };
  }, [sessions]);

  return (
    <div className="classes-page">
      <section className="card stack" aria-label="Upcoming classes">
        <header className="classes-head">
          <h2>Classes — {cohort.code}</h2>
          {!readOnly ? <button type="button" onClick={() => setDlg({ type: 'edit', session: null })}>Add class</button> : null}
        </header>
        {readOnly ? <p role="status" className="banner">Archived cohort: class sessions are read-only.</p> : null}
        {notice ? <p role="status">{notice}</p> : null}
        {error ? <p role="alert" className="error">{error}</p> : null}
        {sessions === null ? <p role="status">Loading…</p> : null}
        {sessions !== null ? (
          <>
            <h3>Upcoming</h3>
            {upcoming.length === 0 ? <p className="muted">No upcoming classes.</p> : <SessionList items={upcoming} readOnly={readOnly} onAction={setDlg} />}
          </>
        ) : null}
      </section>
      {sessions !== null ? (
        <section className="card stack" aria-label="Past classes">
          <h2>Past classes</h2>
          {past.length === 0 ? <p className="muted">No past classes.</p> : <SessionList items={past} readOnly={readOnly} onAction={setDlg} />}
        </section>
      ) : null}
      {dlg?.type === 'edit' ? (
        <ClassDialog
          cohortId={cohort.id}
          session={dlg.session}
          groups={groups}
          content={content}
          onCancel={() => setDlg(null)}
          onDone={() => done(dlg.session ? 'Saved.' : 'Class added.')}
        />
      ) : null}
      {dlg?.type === 'delete' ? (
        <DeleteDialog session={dlg.session} onCancel={() => setDlg(null)} onDone={() => done(`Deleted “${dlg.session.title}”.`)} />
      ) : null}
    </div>
  );
}

function SessionList({ items, readOnly, onAction }: { items: ClassSession[]; readOnly: boolean; onAction: (d: Dlg) => void }) {
  return (
    <ul className="class-list">
      {items.map((s) => (
        <li key={s.id} className="class-item" aria-label={s.title}>
          <span className="class-when">{longDate(s.starts_at)}</span>
          <h3>{s.title}</h3>
          <ul className="class-slots" aria-label="Time slots">
            {s.slots.map((x) => <li key={x.id}>{slotText(x)}</li>)}
          </ul>
          <div className="class-meta">
            <span>{s.deliverables.length} deliverable{s.deliverables.length === 1 ? '' : 's'}</span>
            <span>{labText(s.lab_block_until)}</span>
          </div>
          {s.content.length > 0 ? (
            <ul className="class-links" aria-label="Linked items">
              {s.content.map((c) => (
                <li key={c.id}><span className={`badge status-${c.status}`}>{c.title} · {c.kind === 'material' ? 'material' : 'tutorial'} · {c.status.replace('_', ' ')}</span></li>
              ))}
            </ul>
          ) : null}
          {!readOnly ? (
            <div className="class-actions">
              <button type="button" aria-label={`Edit ${s.title} ${s.date}`} onClick={() => onAction({ type: 'edit', session: s })}>Edit</button>
              <button type="button" aria-label={`Delete ${s.title} ${s.date}`} onClick={() => onAction({ type: 'delete', session: s })}>Delete</button>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function DeleteDialog({ session, onCancel, onDone }: { session: ClassSession; onCancel: () => void; onDone: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    const res = await api.adminDeleteClassSession(session.id);
    if (res.ok) await onDone();
    else {
      setError(classesError(res.error));
      setBusy(false);
    }
  };
  return (
    <Dialog title="Delete class" submitLabel="Delete" onCancel={onCancel} onSubmit={() => void submit()} busy={busy} error={error}>
      <p>Delete “{session.title}” on {session.date}? Linked items stay, but are no longer released by this class. This cannot be undone.</p>
    </Dialog>
  );
}
