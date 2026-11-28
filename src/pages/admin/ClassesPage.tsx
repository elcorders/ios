import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import type { AdminContentRow, ClassSession, ClassTemplate } from '../../api/types';
import { useAdmin } from './AdminContext';
import { Dialog } from './Dialog';
import { ClassDialog } from './classes/ClassDialog';
import { SessionCard } from './classes/SessionCard';
import { TemplatesDialog } from './classes/TemplatesDialog';
import { classesError, isUpcoming } from './classes/classesHelpers';
import './content.css';
import './classes.css';

type Dlg =
  | { type: 'edit'; session: ClassSession | null; duplicate: boolean }
  | { type: 'delete'; session: ClassSession }
  | { type: 'templates' };

/** Admin › Classes (§S14): class sessions of the selected cohort. */
export function ClassesPage() {
  const { cohort, readOnly } = useAdmin();
  const [sessions, setSessions] = useState<ClassSession[] | null>(null);
  const [groups, setGroups] = useState<number[]>([]);
  const [templates, setTemplates] = useState<ClassTemplate[]>([]);
  const [content, setContent] = useState<AdminContentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dlg, setDlg] = useState<Dlg | null>(null);

  const load = useCallback(async () => {
    const [s, g, t, m, tp] = await Promise.all([
      api.adminListClassSessions(cohort.id),
      api.adminListSurvey(cohort.id),
      api.adminListContent('tutorial', cohort.id),
      api.adminListContent('material', cohort.id),
      api.adminListClassTemplates(),
    ]);
    if (s.ok) {
      setSessions(s.data);
      setError(null);
    } else setError(classesError(s.error));
    if (g.ok) setGroups(g.data.groups.map((x) => x.no));
    if (tp.ok) setTemplates(tp.data);
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
          {!readOnly ? (
            <div className="class-head-actions">
              <button type="button" onClick={() => setDlg({ type: 'templates' })}>Templates</button>
              <button type="button" className="primary" onClick={() => setDlg({ type: 'edit', session: null, duplicate: false })}>Add class day</button>
            </div>
          ) : null}
        </header>
        {readOnly ? <p role="status" className="banner">Archived cohort: class sessions are read-only.</p> : null}
        {notice ? <p role="status">{notice}</p> : null}
        {error ? <p role="alert" className="error">{error}</p> : null}
        {sessions === null ? <p role="status">Loading…</p> : null}
        {sessions !== null ? (
          <>
            <h3>Upcoming</h3>
            {upcoming.length === 0 ? <p className="muted">No upcoming classes.</p> : <SessionList items={upcoming} templates={templates} readOnly={readOnly} onAction={setDlg} />}
          </>
        ) : null}
      </section>
      {sessions !== null ? (
        <section className="card stack" aria-label="Past classes">
          <h2>Past classes</h2>
          {past.length === 0 ? <p className="muted">No past classes.</p> : <SessionList items={past} templates={templates} readOnly={readOnly} onAction={setDlg} />}
        </section>
      ) : null}
      {dlg?.type === 'edit' ? (
        <ClassDialog
          cohortId={cohort.id}
          session={dlg.session}
          duplicate={dlg.duplicate}
          templates={templates}
          groups={groups}
          content={content}
          onCancel={() => setDlg(null)}
          onDone={() => done(dlg.session && !dlg.duplicate ? 'Saved.' : 'Class day added.')}
        />
      ) : null}
      {dlg?.type === 'templates' ? <TemplatesDialog onClose={() => setDlg(null)} onChanged={() => void load()} /> : null}
      {dlg?.type === 'delete' ? (
        <DeleteDialog session={dlg.session} onCancel={() => setDlg(null)} onDone={() => done(`Deleted “${dlg.session.title}”.`)} />
      ) : null}
    </div>
  );
}

function SessionList({ items, templates, readOnly, onAction }: { items: ClassSession[]; templates: ClassTemplate[]; readOnly: boolean; onAction: (d: Dlg) => void }) {
  return (
    <ul className="class-list">
      {items.map((s) => (
        <SessionCard
          key={s.id}
          session={s}
          templates={templates}
          readOnly={readOnly}
          onEdit={() => onAction({ type: 'edit', session: s, duplicate: false })}
          onDuplicate={() => onAction({ type: 'edit', session: s, duplicate: true })}
          onDelete={() => onAction({ type: 'delete', session: s })}
        />
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
      <p>Delete “{session.title}” on {session.date}? Its tutorials and materials stay, but are no longer released by this class. This cannot be undone.</p>
    </Dialog>
  );
}
