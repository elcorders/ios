/**
 * Normalise a Sri Lankan mobile number to E.164 (`+947XXXXXXXX`).
 * Accepts `07XXXXXXXX`, `7XXXXXXXX`, `947XXXXXXXX`, `+947XXXXXXXX`, `00947XXXXXXXX`,
 * with spaces, dashes or brackets. Returns null when it is not a valid LK mobile number.
 */
export function normaliseLkPhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let s = input.trim().replace(/[\s\-().]/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  else if (s.startsWith('00')) s = s.slice(2);
  let national: string;
  if (s.startsWith('94')) national = s.slice(2);
  else if (s.startsWith('0')) national = s.slice(1);
  else national = s;
  return /^7\d{8}$/.test(national) ? `+94${national}` : null;
}
