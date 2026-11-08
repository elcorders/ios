import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import type { AdminCohort, AdminContentRow, ContentKind } from '../../api/types';
import { colomboLocalToIso, isoToColomboLocal } from '../../lib/colomboLocal';
import { formatColombo } from '../../lib/time';
import { useAdmin } from './AdminContext';
import { Dialog } from './Dialog';
import {
  contentError, formatSize, MAX_HTML_BYTES, readFileText, statusLabel, titleFromHtml,
} from './contentHelpers';
import './content.css';

type Dlg =
  | { type: 'edit'; row: AdminContentRow | null }
  | { type: 'schedule'; row: AdminContentRow }
  | { type: 'delete'; row: AdminContentRow }
  | { type: 'preview'; row: AdminContentRow }
  | { type: 'copy' };

export function ContentPage() {
  const { cohort, cohorts, readOnly, reloadCohorts } = useAdmin();
  return (
    <div className="stack-lg">
      <ContentSection
        key={`t-${cohort.id}`}
        kind="tutorial"
        cohort={cohort}
        cohorts={cohorts}
        readOnly={readOnly}
        onChanged={reloadCohorts}
      />
      <ContentSection key="r" kind="resource" cohort={cohort} cohorts={cohorts} readOnly={false} onChanged={reloadCohorts} />
    </div>
  );
}

interface SectionProps {
  kind: ContentKind;
  cohort: AdminCohort;
  cohorts: AdminCohort[];
  readOnly: boolean;
  onChanged: () => Promise<void>;
}

function ContentSection({ kind, cohort, cohorts, readOnly }: SectionProps) {
  const cohortId = kind === 'tutorial' ? cohort.id : null;
  const isTut = kind === 'tutorial';
  const heading = isTut ? `Tutorials — ${cohort.code}` : 'Common resources';
  const noun = isTut ? 'tutorial' : 'resource';
  const [rows, setRows] = useState<AdminContentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dlg, setDlg] = useState<Dlg | null>(null);

  const load = useCallback(async () => {
    const res = await api.adminListContent(kind, cohortId);
    if (res.ok) {
      setRows(res.data);
      setError(null);
    } else {
      setError(contentError(res.error));
    }
  }, [kind, cohortId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    void load();
  }, [load]);

  const act = async (fn: () => ReturnType<typeof api.adminSetContentPublish>, done: string) => {
    setNotice(null);
    const res = await fn();
    if (res.ok) {
      setNotice(done);
      setError(null);
      await load();
    } else {
      setError(contentError(res.error));
    }
  };

  const done = async (msg?: string) => {
    setDlg(null);
    if (msg) setNotice(msg);
    await load();
  };

  return (
    <section className="card content-section" aria-label={heading}>
      <header>
        <h2>{heading}</h2>
        <div className="content-actions">
          {isTut && !readOnly ? (
            <button type="button" onClick={() => setDlg({ type: 'copy' })}>Copy from another cohort</button>
          ) : null}
          {!readOnly ? <button type="button" onClick={() => setDlg({ type: 'edit', row: null })}>Add {noun}</button> : null}
        </div>
      </header>
      {isTut && readOnly ? <p role="status" className="banner">Archived cohort: tutorials are read-only.</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {error ? <p role="alert" className="error">{error}</p> : null}
      {rows === null ? (
        <p role="status">Loading…</p>
      ) : rows.length === 0 ? (
        <p>No {noun}s yet.</p>
      ) : (
        <div className="table-wrap content-table">
          <table>
            <caption className="sr-only">{heading}</caption>
            <thead>
              <tr><th>Order</th><th>Title</th><th>Status</th><th>Size</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="c-order">{r.position}</td>
                  <td className="content-title">
                    {r.title}
                    {r.summary ? <small>{r.summary}</small> : null}
                  </td>
                  <td className="c-status"><span className={`badge status-${r.status}`}>{statusLabel(r)}</span></td>
                  <td className="c-size">{formatSize(r.size_bytes)}</td>
                  <td className="c-actions">
                    <div className="content-actions">
                      <button type="button" aria-label={`Preview ${r.title}`} onClick={() => setDlg({ type: 'preview', row: r })}>Preview</button>
                      {!readOnly ? (
                        <>
                          <button type="button" aria-label={`Edit ${r.title}`} onClick={() => setDlg({ type: 'edit', row: r })}>Edit</button>
                          {r.status !== 'published' ? (
                            <button
                              type="button"
                              aria-label={`Publish now ${r.title}`}
                              onClick={() => void act(() => api.adminSetContentPublish(r.id, new Date().toISOString()), `Published “${r.title}”.`)}
                            >Publish now</button>
                          ) : null}
                          <button type="button" aria-label={`Schedule ${r.title}`} onClick={() => setDlg({ type: 'schedule', row: r })}>Schedule…</button>
                          {r.status !== 'draft' ? (
                            <button
                              type="button"
                              aria-label={`Unpublish ${r.title}`}
                              onClick={() => void act(() => api.adminSetContentPublish(r.id, null), `Unpublished “${r.title}”.`)}
                            >Unpublish</button>
                          ) : null}
                          <button type="button" aria-label={`Delete ${r.title}`} onClick={() => setDlg({ type: 'delete', row: r })}>Delete</button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {dlg?.type === 'edit' ? (
        <EditDialog kind={kind} cohortId={cohortId} row={dlg.row} onCancel={() => setDlg(null)} onDone={() => done(dlg.row ? 'Saved.' : 'Added as a draft.')} />
      ) : null}
      {dlg?.type === 'schedule' ? (
        <ScheduleDialog row={dlg.row} onCancel={() => setDlg(null)} onDone={() => done(`Scheduled “${dlg.row.title}”.`)} />
      ) : null}
      {dlg?.type === 'delete' ? (
        <DeleteDialog row={dlg.row} onCancel={() => setDlg(null)} onDone={() => done(`Deleted “${dlg.row.title}”.`)} />
      ) : null}
      {dlg?.type === 'preview' ? <PreviewDialog row={dlg.row} onClose={() => setDlg(null)} /> : null}
      {dlg?.type === 'copy' ? (
        <CopyDialog cohort={cohort} cohorts={cohorts} onCancel={() => setDlg(null)} onDone={(n) => done(`Copied ${n} as drafts`)} />
      ) : null}
    </section>
  );
}

interface BaseProps {
  onCancel: () => void;
}

function EditDialog({ kind, cohortId, row, onCancel, onDone }: BaseProps & {
  kind: ContentKind; cohortId: string | null; row: AdminContentRow | null; onDone: () => Promise<void>;
}) {
  const [title, setTitle] = useState(row?.title ?? '');
  const [summary, setSummary] = useState(row?.summary ?? '');
  const [position, setPosition] = useState(String(row?.position ?? 1));
  const [file, setFile] = useState<{ name: string; size: number; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (f: File | undefined) => {
    setError(null);
    if (!f) return setFile(null);
    if (f.size > MAX_HTML_BYTES) {
      setFile(null);
      return setError('File too large (max 2 MB).');
    }
    const text = await readFileText(f);
    setFile({ name: f.name, size: f.size, text });
    if (!title.trim()) setTitle(titleFromHtml(text));
  };

  const submit = async () => {
    const pos = Number(position);
    if (!title.trim()) return setError('Title is required.');
    if (!Number.isInteger(pos) || pos < 0) return setError('Order must be a whole number (0 or more).');
    if (!row && !file) return setError('Choose an HTML file.');
    setBusy(true);
    const res = await api.adminUpsertContent({
      id: row?.id ?? null, kind, cohort_id: cohortId, title: title.trim(),
      summary: summary.trim() || null, position: pos, body_html: file?.text ?? null,
    });
    if (res.ok) await onDone();
    else {
      setError(contentError(res.error));
      setBusy(false);
    }
  };

  return (
    <Dialog title={row ? `Edit ${kind}` : `Add ${kind}`} submitLabel="Save" onCancel={onCancel} onSubmit={() => void submit()} busy={busy} error={error}>
      <div className="field">
        <label htmlFor="ct-file">HTML file{row ? ' (optional, keeps the current page)' : ''}</label>
        <input id="ct-file" type="file" accept=".html,.htm" onChange={(e) => void pick(e.target.files?.[0])} />
        {file ? <span className="content-file">{file.name} ({formatSize(file.size)})</span> : null}
      </div>
      <div className="field">
        <label htmlFor="ct-title">Title</label>
        <input id="ct-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="ct-summary">Summary</label>
        <textarea id="ct-summary" rows={2} maxLength={500} value={summary} onChange={(e) => setSummary(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="ct-order">Order</label>
        <input id="ct-order" type="number" min={0} step={1} inputMode="numeric" value={position} onChange={(e) => setPosition(e.target.value)} />
      </div>
    </Dialog>
  );
}

function ScheduleDialog({ row, onCancel, onDone }: BaseProps & { row: AdminContentRow; onDone: () => Promise<void> }) {
  const scheduled = row.status === 'scheduled' && row.published_at;
  const [value, setValue] = useState(scheduled ? isoToColomboLocal(row.published_at!) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const iso = colomboLocalToIso(value);
    if (!iso) return setError('Pick a date and time.');
    if (Date.parse(iso) <= Date.now()) return setError('Pick a time in the future, or use Publish now.');
    setBusy(true);
    const res = await api.adminSetContentPublish(row.id, iso);
    if (res.ok) await onDone();
    else {
      setError(contentError(res.error));
      setBusy(false);
    }
  };

  return (
    <Dialog title={`Schedule “${row.title}”`} submitLabel="Schedule" onCancel={onCancel} onSubmit={() => void submit()} busy={busy} error={error}>
      {scheduled ? <p>Currently scheduled for {formatColombo(row.published_at!)} (Colombo time).</p> : null}
      <div className="field">
        <label htmlFor="ct-when">Publish at (Colombo time, UTC+05:30)</label>
        <input id="ct-when" type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} />
      </div>
    </Dialog>
  );
}

function DeleteDialog({ row, onCancel, onDone }: BaseProps & { row: AdminContentRow; onDone: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    const res = await api.adminDeleteContent(row.id);
    if (res.ok) await onDone();
    else {
      setError(contentError(res.error));
      setBusy(false);
    }
  };
  return (
    <Dialog title="Delete" submitLabel="Delete" onCancel={onCancel} onSubmit={() => void submit()} busy={busy} error={error}>
      <p>Delete “{row.title}”? This cannot be undone.</p>
    </Dialog>
  );
}

function CopyDialog({ cohort, cohorts, onCancel, onDone }: BaseProps & {
  cohort: AdminCohort; cohorts: AdminCohort[]; onDone: (copied: number) => Promise<void>;
}) {
  const sources = cohorts.filter((c) => c.id !== cohort.id);
  const [from, setFrom] = useState(sources[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (!from) return setError('Choose a cohort to copy from.');
    setBusy(true);
    const res = await api.adminCopyTutorials(from, cohort.id);
    if (res.ok) await onDone(res.data.copied);
    else {
      setError(contentError(res.error));
      setBusy(false);
    }
  };
  return (
    <Dialog title="Copy tutorials" submitLabel="Copy" onCancel={onCancel} onSubmit={() => void submit()} busy={busy} error={error}>
      <div className="field">
        <label htmlFor="ct-from">Copy from</label>
        <select id="ct-from" value={from} onChange={(e) => setFrom(e.target.value)}>
          {sources.map((c) => <option key={c.id} value={c.id}>{c.code} ({c.batch})</option>)}
        </select>
      </div>
      <p>Tutorials from that cohort are copied into {cohort.code} as drafts. Nothing is published.</p>
    </Dialog>
  );
}

function PreviewDialog({ row, onClose }: { row: AdminContentRow; onClose: () => void }) {
  const [body, setBody] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void api.adminGetContent(row.id).then((res) => {
      if (!live) return;
      if (res.ok) setBody(res.data.body_html);
      else setError(contentError(res.error));
    });
    return () => {
      live = false;
    };
  }, [row.id]);
  return (
    <div className="dialog-backdrop">
      <div role="dialog" aria-modal="true" aria-label={`Preview: ${row.title}`} className="card dialog preview-dialog">
        <header>
          <h2>Preview: {row.title}</h2>
          <button type="button" onClick={onClose}>Close</button>
        </header>
        {error ? <p role="alert" className="error">{error}</p> : null}
        {body === null && !error ? <p role="status">Loading…</p> : null}
        {body !== null ? <iframe title={`Preview of ${row.title}`} sandbox="allow-scripts" srcDoc={body} /> : null}
      </div>
    </div>
  );
}
