import { useEffect, useState } from 'react';
import { api } from '../api';

/** Unread notification count (§S19). Refreshes when `key` changes (route) and on a service-worker `{ type: 'push' }` message. */
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
    return () => {
      live = false;
      sw?.removeEventListener?.('message', onMessage);
    };
  }, [enabled, key]);

  return enabled ? count : 0;
}
