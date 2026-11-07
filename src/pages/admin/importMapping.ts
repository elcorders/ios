import type { RosterRow } from '../../api/types';

/** Contract limit for one roster-import call. */
export const MAX_IMPORT_ROWS = 500;

export const FIELDS = ['email', 'index_no', 'first_name', 'last_name', 'full_name', 'lms_username', 'phone'] as const;
export type Field = (typeof FIELDS)[number];

export const FIELD_LABELS: Record<Field, string> = {
  email: 'Email',
  index_no: 'Index no',
  first_name: 'First name',
  last_name: 'Last name',
  full_name: 'Full name (split)',
  lms_username: 'Username',
  phone: 'Phone',
};

/** Column index per field; -1 = not mapped. */
export type Mapping = Record<Field, number>;

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, '');

const ALIASES: Record<Field, string[]> = {
  email: ['email', 'emailaddress', 'mail', 'studentemail'],
  index_no: ['index', 'indexno', 'indexnumber', 'idnumber', 'studentid', 'studentno', 'id'],
  first_name: ['firstname', 'first', 'givenname', 'forename'],
  last_name: ['lastname', 'last', 'surname', 'familyname'],
  full_name: ['fullname', 'name', 'studentname'],
  lms_username: ['username', 'user', 'lmsusername', 'login'],
  phone: ['phone', 'phoneno', 'phonenumber', 'mobile', 'mobileno', 'mobilenumber', 'contact', 'contactnumber'],
};

/** Case-insensitive header auto-detection; each column is used at most once. */
export function detectMapping(headers: string[]): Mapping {
  const mapping = Object.fromEntries(FIELDS.map((f) => [f, -1])) as Mapping;
  const used = new Set<number>();
  for (const field of FIELDS) {
    const idx = headers.findIndex((h, i) => !used.has(i) && ALIASES[field].includes(norm(h)));
    if (idx >= 0) {
      mapping[field] = idx;
      used.add(idx);
    }
  }
  // A separate first/last name pair beats a combined "name" column.
  if (mapping.first_name >= 0 && mapping.last_name >= 0) mapping.full_name = -1;
  return mapping;
}

/** "Test Student" → first "Test", last "Student"; the last word is the last name. */
export function splitFullName(full: string): { first_name: string; last_name: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first_name: '', last_name: '' };
  if (parts.length === 1) return { first_name: parts[0]!, last_name: '' };
  return { first_name: parts.slice(0, -1).join(' '), last_name: parts[parts.length - 1]! };
}

const cell = (row: string[], idx: number): string => (idx >= 0 ? (row[idx] ?? '').trim() : '');

/** Builds roster rows from the data rows (header excluded). Fully blank lines are dropped but
 * `sourceLines` keeps the spreadsheet line of each kept row (header = line 1). */
export function buildRows(data: string[][], mapping: Mapping): { rows: RosterRow[]; sourceLines: number[] } {
  const rows: RosterRow[] = [];
  const sourceLines: number[] = [];
  data.forEach((raw, i) => {
    if (raw.every((c) => !String(c ?? '').trim())) return;
    let first = cell(raw, mapping.first_name);
    let last = cell(raw, mapping.last_name);
    if (mapping.first_name < 0 && mapping.last_name < 0 && mapping.full_name >= 0) {
      ({ first_name: first, last_name: last } = splitFullName(cell(raw, mapping.full_name)));
    }
    const row: RosterRow = { email: cell(raw, mapping.email), first_name: first, last_name: last };
    const index_no = cell(raw, mapping.index_no);
    const lms_username = cell(raw, mapping.lms_username);
    const phone = cell(raw, mapping.phone);
    if (index_no) row.index_no = index_no;
    if (lms_username) row.lms_username = lms_username;
    if (phone) row.phone = phone;
    rows.push(row);
    sourceLines.push(i + 2);
  });
  return { rows, sourceLines };
}
