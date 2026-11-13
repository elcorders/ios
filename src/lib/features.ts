/**
 * Feature flags (build-time env). Push (S16): `VITE_FEATURE_PUSH`
 * - `on`    → everyone sees the notifications tile; admins see Admin › Notifications
 * - `admin` → only admins (test on your own devices first)
 * - unset / anything else → off (no tile, no admin tab)
 */
export type PushFlag = 'off' | 'admin' | 'on';

export function pushFlag(raw: string | undefined = import.meta.env.VITE_FEATURE_PUSH): PushFlag {
  const v = (raw ?? '').trim().toLowerCase();
  return v === 'on' || v === 'admin' ? v : 'off';
}

export function pushEnabledFor(isAdmin: boolean, flag: PushFlag = pushFlag()): boolean {
  return flag === 'on' || (flag === 'admin' && isAdmin);
}
