import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import type { KioskDevice, Uuid } from '../../api/types';
import { messageFor } from '../../lib/errors';
import { formatColombo } from '../../lib/time';
import { useAdmin } from './AdminContext';
import { Dialog } from './Dialog';
import './kiosks.css';

export const KIOSK_REFRESH_MS = 30_000;

const when = (iso: string | null) => (iso ? formatColombo(iso, { dateStyle: 'medium', timeStyle: 'short' }) : 'never');

/** "Online" or "Last seen <Colombo time>". */
export function statusText(d: KioskDevice): string {
  return d.online ? 'Online' : `Last seen ${when(d.last_seen_at)}`;
}

type Editing = { kind: 'edit' | 'revoke' | 'delete'; device: KioskDevice };

/** Admin > Kiosks (S21.F2). Access is enforced by the backend; AdminLayout only hides it. */
export function KiosksPage() {
  const { cohorts } = useAdmin();
  const [devices, setDevices] = useState<KioskDevice[] | null>(null);
  const [current, setCurrent] = useState<Uuid | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Editing | null>(null);
  const [name, setName] = useState('');
  const [override, setOverride] = useState('');
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await api.adminListKiosks();
    if (res.ok) {
      setDevices(res.data.devices);
      setCurrent(res.data.current_cohort_id);
      setError(null);
    } else {
      setError(messageFor(res.error));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    void load();
    const t = setInterval(() => void load(), KIOSK_REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const active = cohorts.filter((c) => c.status === 'active');

  async function chooseCurrent(value: string) {
    setNotice(null);
    const res = await api.adminSetKioskCohort(value || null);
    if (!res.ok) {
      setError(messageFor(res.error));
      return;
    }
    setCurrent(res.data.current_cohort_id);
    setNotice('Current cohort saved.');
    await load();
  }

  function openEdit(device: KioskDevice) {
    setName(device.name);
    setOverride(device.cohort_id ?? '');
    setDialogError(null);
    setDialog({ kind: 'edit', device });
  }

  function openRevoke(device: KioskDevice) {
    setDialogError(null);
    setDialog({ kind: 'revoke', device });
  }

  function openDelete(device: KioskDevice) {
    setDialogError(null);
    setDialog({ kind: 'delete', device });
  }

  async function submit() {
    if (!dialog) return;
    setBusy(true);
    const res =
      dialog.kind === 'edit'
        ? await api.adminUpdateKiosk(dialog.device.id, name.trim(), override || null)
        : dialog.kind === 'revoke'
          ? await api.adminRevokeKiosk(dialog.device.id)
          : await api.adminDeleteKiosk(dialog.device.id);
    setBusy(false);
    if (!res.ok) {
      setDialogError(messageFor(res.error));
      return;
    }
    setDialog(null);
    setNotice(dialog.kind === 'edit' ? 'Kiosk saved.' : dialog.kind === 'revoke' ? 'Kiosk revoked.' : `${dialog.device.name} deleted.`);
    await load();
  }

  return (
    <section className="stack">
      <div className="card stack">
        <div className="row kiosks-head">
          <h2>Kiosks</h2>
          <Link to="/kiosk/pair" className="button">Pair a new screen</Link>
        </div>
        <div className="field">
          <label htmlFor="kiosk-current-cohort">Current cohort</label>
          <select id="kiosk-current-cohort" value={current ?? ''} onChange={(e) => void chooseCurrent(e.target.value)}>
            <option value="">Automatic (the only active cohort)</option>
            {active.map((c) => (
              <option key={c.id} value={c.id}>{c.code} ({c.batch})</option>
            ))}
          </select>
          <span className="muted">Kiosks without their own cohort show this one.</span>
        </div>
      </div>
      {error ? <p role="alert" className="error">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {!devices && !error ? <p role="status">Loading…</p> : null}
      {devices && devices.length === 0 ? <p>No kiosks are paired yet.</p> : null}
      <ul className="kiosk-list">
        {(devices ?? []).map((d) => (
          <li key={d.id} className={`card kiosk-item${d.revoked_at ? ' revoked' : ''}`}>
            <div className="kiosk-title">
              <strong>{d.name}</strong>
              {d.revoked_at ? (
                <span className="badge">Revoked {when(d.revoked_at)}</span>
              ) : (
                <span className="kiosk-status">
                  <span className={`kiosk-dot ${d.online ? 'on' : 'off'}`} aria-hidden="true" />
                  {statusText(d)}
                </span>
              )}
            </div>
            <p className="muted kiosk-meta">
              Cohort: {d.cohort_code ?? 'follows current'} · Paired by {d.paired_by_name} · {when(d.created_at)}
              {d.last_ip ? ` · IP ${d.last_ip}` : ''}
              {d.ip_changed ? <span className="badge"> IP changed</span> : null}
            </p>
            {d.revoked_at ? (
              <div className="row">
                <button type="button" className="danger" aria-label={`Delete ${d.name}`} onClick={() => openDelete(d)}>Delete</button>
              </div>
            ) : (
              <div className="row">
                <Link className="button primary" to={`/admin/kiosks/${d.id}/remote`} aria-label={`Remote ${d.name}`}>Remote</Link>
                <button type="button" aria-label={`Edit ${d.name}`} onClick={() => openEdit(d)}>Rename / cohort</button>
                <button type="button" aria-label={`Revoke ${d.name}`} onClick={() => openRevoke(d)}>Revoke</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {dialog?.kind === 'edit' ? (
        <Dialog title="Edit kiosk" submitLabel="Save" onCancel={() => setDialog(null)} onSubmit={() => void submit()} busy={busy} error={dialogError}>
          <div className="field">
            <label htmlFor="kiosk-name">Name</label>
            <input id="kiosk-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="kiosk-override">Cohort override</label>
            <select id="kiosk-override" value={override} onChange={(e) => setOverride(e.target.value)}>
              <option value="">Follow the current cohort</option>
              {active.map((c) => (
                <option key={c.id} value={c.id}>{c.code} ({c.batch})</option>
              ))}
            </select>
          </div>
        </Dialog>
      ) : null}
      {dialog?.kind === 'revoke' ? (
        <Dialog title="Revoke kiosk?" submitLabel="Revoke" onCancel={() => setDialog(null)} onSubmit={() => void submit()} busy={busy} error={dialogError}>
          <p>
            {dialog.device.name} stops working at once. The screen goes back to the pairing screen at its next check
            (within 15 minutes, or straight away if someone taps Refresh). You can pair it again later.
          </p>
        </Dialog>
      ) : null}
      {dialog?.kind === 'delete' ? (
        <Dialog title="Delete kiosk?" submitLabel="Delete" onCancel={() => setDialog(null)} onSubmit={() => void submit()} busy={busy} error={dialogError}>
          <p>{dialog.device.name} is removed from this list for good. The audit log keeps a record.</p>
        </Dialog>
      ) : null}
    </section>
  );
}
