import { useEffect, useState } from 'react';
import { api } from '../api';

/** Window event fired after the inbox marks notifications read, so the bell badge refreshes at once. */
export const UNREAD_CHANGED = 'unread-changed';

export function notifyUnreadChanged(): void {
  window.dispatchEvent(new Event(UNREAD_CHANGED));
}

/** Unread notification count (§S19). Refreshes when `key` changes (route), on a service-worker `{ type: 'push' }` message and on `UNREAD_CHANGED`. */
export function useUnreadCount(enabled: boolean, key: string): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const refresh = () => {
      void api.getMyPush().then((r) => {
        if (live && r.ok) setCount(r.data.unread);
      });
    };
    refresh();
    const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
    const onMessage = (e: MessageEvent) => {
      if ((e.data as { type?: unknown } | null)?.type === 'push') refresh();
    };
    sw?.addEventListener?.('message', onMessage);
    window.addEventListener(UNREAD_CHANGED, refresh);
    return () => {
      live = false;
      sw?.removeEventListener?.('message', onMessage);
      window.removeEventListener(UNREAD_CHANGED, refresh);
    };
  }, [enabled, key]);

  return enabled ? count : 0;
}
