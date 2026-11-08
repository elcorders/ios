import type { IsoDateTime } from '../api/types';

const OFFSET_MIN = 330; // Asia/Colombo is UTC+05:30 with no DST
const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * Convert a datetime-local value (YYYY-MM-DDTHH:mm), read as Asia/Colombo wall time,
 * to an ISO string with a +05:30 offset. Returns null when the value is not valid.
 */
export function colomboLocalToIso(local: string): IsoDateTime | null {
  const m = LOCAL_RE.exec(local.trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  const probe = new Date(Date.UTC(y, mo - 1, d, h, mi));
  if (
    probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d ||
    probe.getUTCHours() !== h || probe.getUTCMinutes() !== mi
  ) {
    return null;
  }
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+05:30`;
}

/** Inverse: an ISO instant as a datetime-local value in Asia/Colombo wall time. */
export function isoToColomboLocal(iso: IsoDateTime): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return new Date(t + OFFSET_MIN * 60_000).toISOString().slice(0, 16);
}
