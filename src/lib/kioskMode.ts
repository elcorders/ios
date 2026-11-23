/**
 * S21.F6 kiosk mode: once a screen is paired, the site opens straight on the kiosk
 * (no login page). Exit = the logo gesture on the kiosk. Per-browser flag in localStorage;
 * the pairing itself (IndexedDB key) is kept, so the header-logo gesture brings it back.
 */
const KEY = 'nibm-kiosk-mode';

export function isKioskMode(): boolean {
  try {
    return localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
}

export function setKioskMode(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, 'on');
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: the kiosk still works, it just won't auto-open */
  }
}

/** The kiosk's own screens (board, viewer); not the staff pairing page `/kiosk/pair`. */
export const isKioskHash = (hash: string): boolean => /^#\/kiosk(\/c\/|\?|$)/.test(hash);

/** At start-up: a kiosk browser that lands anywhere else is sent to the kiosk. Returns true if it redirected. */
export function kioskBootRedirect(loc: Pick<Location, 'hash' | 'replace' | 'pathname' | 'search'> = window.location): boolean {
  if (!isKioskMode() || isKioskHash(loc.hash)) return false;
  loc.replace(`${loc.pathname}${loc.search}#/kiosk`);
  return true;
}
