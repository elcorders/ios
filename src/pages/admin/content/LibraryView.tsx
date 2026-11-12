import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../api';
import type { AdminCohort, ContentKind, LibraryDetail } from '../../../api/types';
import { formatColombo } from '../../../lib/time';
import {
  contentError, formatSize, FRAME_NAV_WARNING, hasFrameNavigation, MAX_HTML_BYTES, readFileText, statusLabel,
} from '../contentHelpers';
import { Dialog } from '../Dialog';
import { UpdatePrompt } from './UpdatePrompt';

type LibKind = Extract<ContentKind, 'tutorial' | 'material'>;

type Dlg =
  | { type: 'edit'; item: LibraryDetail }
  | { type: 'upload'; item: LibraryDetail }
  | { type: 'link'; item: LibraryDetail }
  | { type: 'delete'; item: LibraryDetail }
  | { type: 'prompt'; item: LibraryDetail; versionNo: number };

/** Library view: every tutorial / material with its versions and cohort links (CONTRACT §S17). */
export function LibraryView({ cohorts }: { cohorts: AdminCohort[] }) {
  const [kind, setKind] = useState<LibKind>('tutorial');
  const [items, setItems] = useState<LibraryDetail[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dlg, setDlg] = useState<Dlg | null>(null);

  const load = useCallback(async () => {
    const list = await api.adminListLibrary(kind);
    if (!list.ok) return setError(contentError(list.error));
    const details = await Promise.all(list.data.map((i) => api.adminGetLibrary(i.id)));
    const bad = details.find((d) => !d.ok);
    if (bad && !bad.ok) return setError(contentError(bad.error));
    setItems(details.flatMap((d) => (d.ok ? [d.data] : [])));
    setError(null);
  }, [kind]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    void load();
  }, [load]);

  const switchKind = (k: LibKind) => {
    setKind(k);
    setItems(null);
    setNotice(null);
  };

  const done = async (msg?: string) => {
    setDlg(null);
    if (msg) setNotice(msg);
    await load();
  };

  const noun = kind === 'tutorial' ? 'tutorial' : 'material';

  return (
    <div className="stack-lg">
      <div className="content-tabs" role="tablist" aria-label="Library kind">
        {(['tutorial', 'material'] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => switchKind(k)}>
            {k === 'tutorial' ? 'Tutorials' : 'Class materials'}
          </button>
        ))}
      </div>
      {notice ? <p role="status">{notice}</p> : null}
      {error ? <p role="alert" className="error">{error}</p> : null}
      {items === null && !error ? <p role="status">Loading…</p> : null}
      {items?.length === 0 ? <p>No {noun}s in the library yet.</p> : null}
      {items?.map((it) => (
        <article key={it.id} className="card content-lib" aria-label={it.title}>
          <header>
            <h3>{it.title}</h3>
            {it.summary ? <p className="content-summary">{it.summary}</p> : null}
          </header>
          <div>
            <h4>Versions</h4>
            <ul className="content-lib-list">
              {it.versions.map((v) => (
                <li key={v.id}>
                  <strong>v{v.version_no}</strong>{v.note ? ` · ${v.note}` : ''}
                  <small>{formatColombo(v.created_at)} · {formatSize(v.size_bytes)} · {v.link_count} {v.link_count === 1 ? 'link' : 'links'}</small>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4>Linked cohorts</h4>
            {it.links.length === 0 ? <p>Not linked to any cohort.</p> : (
              <ul className="content-lib-list">
                {it.links.map((l) => (
                  <li key={l.content_id}>
                    <strong>{l.cohort_code}</strong> · v{l.version_no}{l.version_no < it.latest_version_no ? ` (v${it.latest_version_no} available)` : ''}
                    <small>{statusLabel(l)}{l.cohort_status === 'archived' ? ' · archived cohort' : ''}</small>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="content-actions">
            <button type="button" aria-label={`Edit title and summary of ${it.title}`} onClick={() => setDlg({ type: 'edit', item: it })}>Edit title/summary</button>
            <button type="button" aria-label={`Upload new version of ${it.title}`} onClick={() => setDlg({ type: 'upload', item: it })}>Upload new version</button>
            <button type="button" aria-label={`Link ${it.title} to a cohort`} onClick={() => setDlg({ type: 'link', item: it })}>Link to cohort</button>
            {it.links.length === 0 ? (
              <button type="button" aria-label={`Delete ${it.title} from the library`} onClick={() => setDlg({ type: 'delete', item: it })}>Delete</button>
            ) : null}
          </div>
        </article>
      ))}
      {dlg?.type === 'edit' ? <EditLibraryDialog item={dlg.item} onCancel={() => setDlg(null)} onDone={() => done('Saved.')} /> : null}
      {dlg?.type === 'upload' ? (
        <UploadDialog
          item={dlg.item}
          onCancel={() => setDlg(null)}
          onDone={async (detail) => {
            const versionNo = detail.latest_version_no;
            await load();
            setNotice(`Added v${versionNo}.`);
            setDlg(detail.links.length > 0 ? { type: 'prompt', item: detail, versionNo } : null);
          }}
        />
      ) : null}
      {dlg?.type === 'link' ? (
        <LinkDialog item={dlg.item} cohorts={cohorts} onCancel={() => setDlg(null)} onDone={(c) => done(`Linked to ${c} as a draft.`)} />
      ) : null}
      {dlg?.type === 'delete' ? <DeleteLibraryDialog item={dlg.item} onCancel={() => setDlg(null)} onDone={() => done(`Deleted “${dlg.item.title}”.`)} /> : null}
      {dlg?.type === 'prompt' ? (
        <UpdatePrompt detail={dlg.item} versionNo={dlg.versionNo} onClose={(m) => void done(m)} />
      ) : null}
    </div>
  );
}

interface BaseProps {
  item: LibraryDetail;
  onCancel: () => void;
}

function EditLibraryDialog({ item, onCancel, onDone }: BaseProps & { onDone: () => Promise<void> }) {
  const [title, setTitle] = useState(item.title);
  const [summary, setSummary] = useState(item.summary ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (!title.trim()) return setError('Title is required.');
    setBusy(true);
    const res = await api.adminUpsertLibrary(item.id, title.trim(), summary.trim() || null);
    if (res.ok) await onDone();
    else {
      setError(contentError(res.error));
      setBusy(false);
    }
  };
  return (
    <Dialog title="Edit title and summary" submitLabel="Save" onCancel={onCancel} onSubmit={() => void submit()} busy={busy} error={error}>
      <p>Links keep their own title and summary; this changes the library entry and the default for new links.</p>
      <div className="field">
        <label htmlFor="lib-title">Title</label>
        <input id="lib-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="lib-summary">Summary</label>
        <textarea id="lib-summary" rows={2} maxLength={500} value={summary} onChange={(e) => setSummary(e.target.value)} />
      </div>
    </Dialog>
  );
}

function UploadDialog({ item, onCancel, onDone }: BaseProps & { onDone: (detail: LibraryDetail) => Promise<void> }) {
  const [file, setFile] = useState<{ name: string; size: number; text: string } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (f: File | undefined) => {
    setError(null);
    if (!f) return setFile(null);
    if (f.size > MAX_HTML_BYTES) {
      setFile(null);
      return setError('File too large (max 2 MB).');
    }
    setFile({ name: f.name, size: f.size, text: await readFileText(f) });
  };

  const submit = async () => {
    if (!file) return setError('Choose an HTML file.');
    setBusy(true);
    const res = await api.adminAddLibraryVersion(item.id, file.text, note.trim() || null);
    if (res.ok) await onDone(res.data);
    else {
      setError(contentError(res.error));
      setBusy(false);
    }
  };

  return (
    <Dialog title={`Upload new version of “${item.title}”`} submitLabel="Upload" onCancel={onCancel} onSubmit={() => void submit()} busy={busy} error={error}>
      <p>This adds v{item.latest_version_no + 1}. Cohorts keep their current version until you choose to update them.</p>
      <div className="field">
        <label htmlFor="lib-file">HTML file</label>
        <input id="lib-file" type="file" accept=".html,.htm" onChange={(e) => void pick(e.target.files?.[0])} />
        {file ? <span className="content-file">{file.name} ({formatSize(file.size)})</span> : null}
        {file && hasFrameNavigation(file.text) ? <p className="banner" role="note">{FRAME_NAV_WARNING}</p> : null}
      </div>
      <div className="field">
        <label htmlFor="lib-note">Note (optional)</label>
        <input id="lib-note" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Dialog>
  );
}

function LinkDialog({ item, cohorts, onCancel, onDone }: BaseProps & { cohorts: AdminCohort[]; onDone: (cohortCode: string) => Promise<void> }) {
  const linked = new Set(item.links.map((l) => l.cohort_id));
  const options = cohorts.filter((c) => !linked.has(c.id));
  const [cohortId, setCohortId] = useState(options.find((c) => c.status === 'active')?.id ?? '');
  const [versionId, setVersionId] = useState('');
  const [position, setPosition] = useState('1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const pos = Number(position);
    if (!cohortId) return setError('Choose a cohort.');
    if (!Number.isInteger(pos) || pos < 0) return setError('Order must be a whole number (0 or more).');
    setBusy(true);
    const res = await api.adminLinkLibrary(item.id, cohortId, versionId || null, pos);
    if (res.ok) await onDone(options.find((c) => c.id === cohortId)?.code ?? 'the cohort');
    else {
      setError(res.error.code === 'conflict' ? 'This item is already linked to that cohort.' : contentError(res.error));
      setBusy(false);
    }
  };

  return (
    <Dialog title={`Link “${item.title}” to a cohort`} submitLabel="Link" onCancel={onCancel} onSubmit={() => void submit()} busy={busy} error={error}>
      <p>The cohort gets its own link (a draft) to this item. It is not copied.</p>
      <div className="field">
        <label htmlFor="lib-cohort">Cohort</label>
        <select id="lib-cohort" value={cohortId} onChange={(e) => setCohortId(e.target.value)}>
          <option value="">Choose…</option>
          {options.map((c) => (
            <option key={c.id} value={c.id} disabled={c.status === 'archived'}>
              {c.code} ({c.batch}){c.status === 'archived' ? ' — archived' : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="lib-version">Version</label>
        <select id="lib-version" value={versionId} onChange={(e) => setVersionId(e.target.value)}>
          <option value="">Latest (v{item.latest_version_no})</option>
          {item.versions.map((v) => <option key={v.id} value={v.id}>v{v.version_no}{v.note ? ` — ${v.note}` : ''}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="lib-order">Order</label>
        <input id="lib-order" type="number" min={0} step={1} inputMode="numeric" value={position} onChange={(e) => setPosition(e.target.value)} />
      </div>
    </Dialog>
  );
}

function DeleteLibraryDialog({ item, onCancel, onDone }: BaseProps & { onDone: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    const res = await api.adminDeleteLibrary(item.id);
    if (res.ok) await onDone();
    else {
      setError(res.error.code === 'conflict' ? 'This item is still linked to a cohort. Delete the links first.' : contentError(res.error));
      setBusy(false);
    }
  };
  return (
    <Dialog title="Delete from library" submitLabel="Delete" onCancel={onCancel} onSubmit={() => void submit()} busy={busy} error={error}>
      <p>Delete “{item.title}” and all {item.version_count} {item.version_count === 1 ? 'version' : 'versions'}? This cannot be undone.</p>
    </Dialog>
  );
}
