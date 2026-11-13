import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { MyNotification } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { pushEnabledFor } from '../lib/features';
import { notifyUnreadChanged } from '../lib/unread';
import { messageFor } from '../lib/errors';
import { formatColombo } from '../lib/time';

/** Relative time ("5 min ago"); falls back to a Colombo date after a week. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const diff = Math.max(0, now - Date.parse(iso));
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} d ago`;
  return formatColombo(iso, { day: 'numeric', month: 'short' });
}

/** "/#/lab?b=1" → "/lab?b=1"; anything else → "/". */
export function hashPathOf(url: string | null): string {
  return url && url.startsWith('/#/') ? url.slice(2) : '/';
}

/** Student inbox (§S19). Opening the page does not mark anything read. */
export function Notifications() {
  const { me } = useAuth();
  const navigate = useNavigate();
  const enabled = !!me && pushEnabledFor(me.is_admin);
  const [items, setItems] = useState<MyNotification[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const first = useCallback(async () => {
    const r = await api.listMyNotifications();
    if (r.ok) {
      setItems(r.data.items);
      setHasMore(r.data.has_more);
      setError(null);
    } else setError(messageFor(r.error));
  }, []);
  useEffect(() => {
    if (!enabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data load on mount
    void first();
  }, [enabled, first]);

  if (!enabled) return <Navigate to="/" replace />;

  async function more() {
    const last = items?.[items.length - 1];
    if (!last) return;
    setBusy(true);
    const r = await api.listMyNotifications(last.created_at);
    setBusy(false);
    if (r.ok) {
      setItems([...(items ?? []), ...r.data.items]);
      setHasMore(r.data.has_more);
    } else setError(messageFor(r.error));
  }

  async function markAll() {
    setBusy(true);
    const r = await api.markNotificationsRead(null);
    setBusy(false);
    if (r.ok) {
      const at = new Date().toISOString();
      setItems((items ?? []).map((n) => (n.read_at ? n : { ...n, read_at: at })));
      notifyUnreadChanged();
    } else setError(messageFor(r.error));
  }

  async function open(n: MyNotification) {
    if (!n.read_at) {
      await api.markNotificationsRead([n.id]);
      notifyUnreadChanged();
    }
    navigate(hashPathOf(n.url));
  }

  const unread = (items ?? []).some((n) => !n.read_at);

  return (
    <section className="stack" aria-label="Notifications">
      <h1>Notifications</h1>
      {error ? <p role="alert" className="error">{error}</p> : null}
      {items === null && !error ? <p role="status">Loading…</p> : null}
      {items && items.length === 0 ? <p className="muted">No notifications yet.</p> : null}
      {items && items.length > 0 ? (
        <>
          <div className="row">
            <button type="button" disabled={busy || !unread} onClick={() => void markAll()}>Mark all read</button>
          </div>
          <ul className="notif-list" aria-label="Notification list">
            {items.map((n) => (
              <li key={n.id}>
                <button type="button" className={n.read_at ? 'card notif-item' : 'card notif-item notif-unread'} onClick={() => void open(n)}>
                  <span className="notif-title">
                    {n.read_at ? null : <span className="notif-dot" role="img" aria-label="Unread" />}
                    {n.title}
                  </span>
                  <span>{n.body}</span>
                  <small className="muted">{relativeTime(n.created_at)}</small>
                </button>
              </li>
            ))}
          </ul>
          {hasMore ? <button type="button" disabled={busy} onClick={() => void more()}>Load more</button> : null}
        </>
      ) : null}
    </section>
  );
}
