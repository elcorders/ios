import type { IsoDateTime } from '../api/types';

export const COLOMBO_TZ = 'Asia/Colombo';

const DEFAULTS: Intl.DateTimeFormatOptions = {
  dateStyle: 'medium',
  timeStyle: 'short',
};

/** Format an ISO date-time in Asia/Colombo time. */
export function formatColombo(iso: IsoDateTime, opts: Intl.DateTimeFormatOptions = DEFAULTS): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: COLOMBO_TZ }).format(d);
}
