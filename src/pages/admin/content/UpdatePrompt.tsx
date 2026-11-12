import { useState } from 'react';
import { api } from '../../../api';
import type { LibraryDetail } from '../../../api/types';
import { contentError, statusLabel } from '../contentHelpers';
import { ModalDialog } from './ModalDialog';

interface Props {
  detail: LibraryDetail;
  /** The new version offered to the other links. */
  versionNo: number;
  /** A link that already uses the new version and is not listed (the edited one). */
  excludeContentId?: string;
  onClose: (message?: string) => void;
}

/** "Update other cohorts to vN?": active cohorts ticked, archived unticked (CONTRACT §S17). */
export function UpdatePrompt({ detail, versionNo, excludeContentId, onClose }: Props) {
  const version = detail.versions.find((v) => v.version_no === versionNo);
  const links = detail.links.filter((l) => l.content_id !== excludeContentId && l.version_no !== versionNo);
  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(links.map((l) => [l.content_id, l.cohort_status === 'active'])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = links.filter((l) => checked[l.content_id]);

  const submit = async () => {
    if (!version) return onClose();
    if (selected.length === 0) return setError('Tick at least one cohort, or choose Not now.');
    setBusy(true);
    const res = await api.adminSetLinkVersions(version.id, selected.map((l) => l.content_id));
    if (res.ok) onClose(`Updated ${res.data.updated} ${res.data.updated === 1 ? 'cohort' : 'cohorts'} to v${versionNo}.`);
    else {
      setError(contentError(res.error));
      setBusy(false);
    }
  };

  return (
    <ModalDialog
      title={`Update other cohorts to v${versionNo}?`}
      submitLabel="Update selected"
      cancelLabel="Not now"
      onCancel={() => onClose()}
      onSubmit={() => void submit()}
      busy={busy}
      error={error}
    >
      <p>“{detail.title}” is linked to more than one cohort. Choose which links should switch to v{versionNo} now. Published links stay published and students see the new version at once.</p>
      <ul className="content-checks">
        {links.map((l) => (
          <li key={l.content_id}>
            <label>
              <input
                type="checkbox"
                checked={!!checked[l.content_id]}
                onChange={(e) => setChecked((c) => ({ ...c, [l.content_id]: e.target.checked }))}
              />
              <span>
                <strong>{l.cohort_code}</strong> · now v{l.version_no} · {statusLabel(l)}
                {l.cohort_status === 'archived' ? <em> (archived)</em> : null}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </ModalDialog>
  );
}
