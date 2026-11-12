import { useEffect, useState } from 'react';
import { api } from '../../../api';
import type { AdminContentRow, LibraryDetail } from '../../../api/types';
import { formatColombo } from '../../../lib/time';
import { contentError, formatSize } from '../contentHelpers';
import { ModalDialog } from './ModalDialog';

/** Version…: move one link to any version of its library (rollback or roll forward). */
export function VersionDialog({ row, onCancel, onDone }: { row: AdminContentRow; onCancel: () => void; onDone: (msg: string) => void }) {
  const [detail, setDetail] = useState<LibraryDetail | null>(null);
  const [picked, setPicked] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void api.adminGetLibrary(row.library_id!).then((res) => {
      if (!live) return;
      if (res.ok) {
        setDetail(res.data);
        setPicked(res.data.versions.find((v) => v.version_no === row.version_no)?.id ?? '');
      } else setError(contentError(res.error));
    });
    return () => {
      live = false;
    };
  }, [row.library_id, row.version_no]);

  const submit = async () => {
    const v = detail?.versions.find((x) => x.id === picked);
    if (!v) return setError('Choose a version.');
    if (v.version_no === row.version_no) return onCancel();
    setBusy(true);
    const res = await api.adminSetLinkVersions(v.id, [row.id]);
    if (res.ok) onDone(`“${row.title}” now uses v${v.version_no}.`);
    else {
      setError(contentError(res.error));
      setBusy(false);
    }
  };

  return (
    <ModalDialog title={`Version of “${row.title}”`} submitLabel="Use this version" onCancel={onCancel} onSubmit={() => void submit()} busy={busy || !detail} error={error}>
      {!detail && !error ? <p role="status">Loading…</p> : null}
      {detail ? (
        <fieldset className="content-versions">
          <legend>Pick the version this cohort should show</legend>
          {detail.versions.map((v) => (
            <label key={v.id}>
              <input type="radio" name="ct-version" value={v.id} checked={picked === v.id} onChange={() => setPicked(v.id)} />
              <span>
                <strong>v{v.version_no}</strong>{v.version_no === row.version_no ? ' (current)' : ''}
                {v.note ? ` · ${v.note}` : ''}
                <small>{formatColombo(v.created_at)} · {formatSize(v.size_bytes)} · used by {v.link_count} {v.link_count === 1 ? 'link' : 'links'}</small>
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}
    </ModalDialog>
  );
}
