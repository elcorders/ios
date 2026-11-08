import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import type { EnrolmentRole, RosterImportResult, RosterRow } from '../../api/types';
import { messageFor } from '../../lib/errors';
import { useAdmin } from './AdminContext';
import { Dialog } from './Dialog';
import {
  FIELDS, FIELD_LABELS, MAX_IMPORT_ROWS, buildRows, detectMapping, type Field, type Mapping,
} from './importMapping';

function readBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

/** Parses the first sheet of a CSV/ODS/XLSX file into a string grid (SheetJS is loaded on demand). */
async function parseSpreadsheet(file: File): Promise<string[][]> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await readBuffer(file), { type: 'array' });
  const name = wb.SheetNames[0];
  const sheet = name ? wb.Sheets[name] : undefined;
  if (!sheet) return [];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '' });
  return grid.map((r) => r.map((c) => String(c ?? '')));
}

const show = (v: unknown) => (v === null || v === undefined || v === '' ? '(empty)' : String(v));
const rowLabel = (r: RosterRow) => `${r.first_name} ${r.last_name}`.trim();

const ERROR_TEXT: Partial<Record<string, string>> = {
  email_conflict: 'This email already belongs to another member, so the email cannot be changed to it.',
};

function Diff({ result, lines }: { result: RosterImportResult; lines: number[] | null }) {
  const emailChanges =
    result.update.filter((u) => u.changes.email).length + result.add.filter((a) => a.email_change).length;
  return (
    <div className="stack">
      {emailChanges > 0 ? (
        <p role="status"><strong>{emailChanges} email {emailChanges === 1 ? 'change' : 'changes'}</strong></p>
      ) : null}
      <h3>Add ({result.add.length})</h3>
      {result.add.length > 0 ? (
        <ul>
          {result.add.map((r) => (
            <li key={r.email}>
              {rowLabel(r)} — {r.email}
              {r.email_change ? (
                <>
                  {' '}<span className="badge">Email change</span>{' '}
                  Email: {r.email_change[0]} → {r.email_change[1]} (existing person, new to this cohort)
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <h3>Update ({result.update.length})</h3>
      {result.update.length > 0 ? (
        <ul>
          {result.update.map(({ row, changes }) => (
            <li key={row.email}>
              {row.email}:{' '}
              {changes.email ? (
                <>
                  <span className="badge">Email change</span>{' '}
                  <strong>Email: {show(changes.email[0])} → {show(changes.email[1])}</strong>
                  {Object.keys(changes).length > 1 ? '; ' : ''}
                </>
              ) : null}
              {Object.entries(changes).filter(([f]) => f !== 'email')
                .map(([f, [a, b]]) => `${f} ${show(a)} → ${show(b)}`).join('; ')}
            </li>
          ))}
        </ul>
      ) : null}
      <h3>Unchanged ({result.unchanged})</h3>
      <h3>Not in file ({result.not_in_file.length})</h3>
      {result.not_in_file.length > 0 ? (
        <>
          <p>Informational only. Nobody is removed by an import.</p>
          <ul>
            {result.not_in_file.map((m) => <li key={m.enrolment_id}>{m.email}</li>)}
          </ul>
        </>
      ) : null}
      <h3>Errors ({result.errors.length})</h3>
      {result.errors.length > 0 ? (
        <ul>
          {result.errors.map((e) => (
            <li key={`${e.row_index}-${e.code}`} className="error">
              Row {lines?.[e.row_index] ?? e.row_index + 2}: {e.code} — {ERROR_TEXT[e.code] ?? e.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function AddOne({ role: initialRole }: { role: EnrolmentRole }) {
  const { cohort, readOnly, reloadCohorts } = useAdmin();
  const [form, setForm] = useState({ email: '', first_name: '', last_name: '', index_no: '', phone: '' });
  const [role, setRole] = useState<EnrolmentRole>(initialRole);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const row: RosterRow = { email: form.email, first_name: form.first_name, last_name: form.last_name };
    if (form.index_no.trim()) row.index_no = form.index_no;
    if (form.phone.trim()) row.phone = form.phone;
    const input = { cohort_id: cohort.id, role, rows: [row] };
    const dry = await api.rosterImport({ ...input, dry_run: true });
    if (!dry.ok) {
      setMessage({ text: messageFor(dry.error), isError: true });
    } else if (dry.data.errors.length > 0) {
      const err = dry.data.errors[0]!;
      setMessage({ text: `${err.code}: ${err.message}`, isError: true });
    } else if (dry.data.add.length + dry.data.update.length === 0) {
      setMessage({ text: 'Already on the list, nothing changed.', isError: false });
    } else {
      const res = await api.rosterImport({ ...input, dry_run: false });
      if (res.ok) {
        const verb = res.data.add.length > 0 ? 'Added' : 'Updated';
        setMessage({ text: `${verb} ${form.email.trim()}.`, isError: false });
        setForm({ email: '', first_name: '', last_name: '', index_no: '', phone: '' });
        await reloadCohorts();
      } else {
        setMessage({ text: messageFor(res.error), isError: true });
      }
    }
    setBusy(false);
  };

  return (
    <form className="card stack" onSubmit={(e) => void submit(e)} aria-labelledby="add-one-title">
      <h3 id="add-one-title">Add one person</h3>
      <div className="field">
        <label htmlFor="one-email">Email</label>
        <input id="one-email" type="email" required value={form.email} onChange={set('email')} />
      </div>
      <div className="field">
        <label htmlFor="one-first">First name</label>
        <input id="one-first" required value={form.first_name} onChange={set('first_name')} />
      </div>
      <div className="field">
        <label htmlFor="one-last">Last name</label>
        <input id="one-last" required value={form.last_name} onChange={set('last_name')} />
      </div>
      <div className="field">
        <label htmlFor="one-index">Index no (optional)</label>
        <input id="one-index" value={form.index_no} onChange={set('index_no')} />
      </div>
      <div className="field">
        <label htmlFor="one-phone">Phone (optional)</label>
        <input id="one-phone" inputMode="tel" value={form.phone} onChange={set('phone')} />
      </div>
      <div className="field">
        <label htmlFor="one-role">Role</label>
        <select id="one-role" value={role} onChange={(e) => setRole(e.target.value as EnrolmentRole)}>
          <option value="student">Student</option>
          <option value="instructor">Instructor</option>
        </select>
      </div>
      {message ? (
        <p role={message.isError ? 'alert' : 'status'} className={message.isError ? 'error' : undefined}>{message.text}</p>
      ) : null}
      <div className="row">
        <button type="submit" disabled={busy || readOnly}>Add person</button>
      </div>
    </form>
  );
}

export function ImportPage() {
  const { cohort, readOnly, reloadCohorts } = useAdmin();
  const [role, setRole] = useState<EnrolmentRole>('student');
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [data, setData] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [result, setResult] = useState<RosterImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const built = useMemo(() => (mapping ? buildRows(data, mapping) : { rows: [], sourceLines: [] }), [data, mapping]);
  const tooMany = built.rows.length > MAX_IMPORT_ROWS;
  const canCheck = !!mapping && mapping.email >= 0 && built.rows.length > 0 && !tooMany && !busy;
  const canApply = !!result && result.dry_run && !readOnly && result.add.length + result.update.length > 0 && !busy;

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setResult(null);
    setError(null);
    if (!file) return;
    try {
      const grid = await parseSpreadsheet(file);
      const [head, ...rest] = grid;
      if (!head || rest.length === 0) {
        setError('The file has no data rows.');
        setHeaders([]);
        setData([]);
        setMapping(null);
        return;
      }
      setFileName(file.name);
      setHeaders(head);
      setData(rest);
      setMapping(detectMapping(head));
    } catch {
      setError('That file could not be read. Use a CSV, ODS or XLSX file.');
      setMapping(null);
    }
  };

  const changeMapping = (field: Field, value: string) => {
    if (!mapping) return;
    setMapping({ ...mapping, [field]: Number(value) });
    setResult(null);
  };

  const run = async (dry_run: boolean) => {
    setBusy(true);
    setError(null);
    const res = await api.rosterImport({ cohort_id: cohort.id, role, dry_run, rows: built.rows });
    setBusy(false);
    setConfirming(false);
    if (res.ok) {
      setResult(res.data);
      if (!dry_run) await reloadCohorts();
    } else {
      setError(messageFor(res.error));
    }
  };

  const applied = result?.applied === true;
  const membersPath = role === 'student' ? '/admin/members' : '/admin/instructors';

  return (
    <div className="stack">
      <h2>Import roster</h2>
      {readOnly ? <p role="status" className="banner">This cohort is read-only, so imports are disabled.</p> : null}

      <section className="card stack" aria-labelledby="file-title">
        <h3 id="file-title">From a file</h3>
        <div className="field">
          <label htmlFor="import-file">File (CSV, ODS or XLSX)</label>
          <input
            id="import-file"
            type="file"
            accept=".csv,.ods,.xlsx,.xls"
            onChange={(e) => void onFile(e)}
          />
        </div>
        <div className="field">
          <label htmlFor="import-role">Role</label>
          <select
            id="import-role"
            value={role}
            onChange={(e) => { setRole(e.target.value as EnrolmentRole); setResult(null); }}
          >
            <option value="student">Student</option>
            <option value="instructor">Instructor</option>
          </select>
        </div>
        {error ? <p role="alert" className="error">{error}</p> : null}

        {mapping ? (
          <>
            <p>{fileName}: {built.rows.length} rows.</p>
            {tooMany ? (
              <p role="alert" className="error">
                Too many rows ({built.rows.length}). Import at most {MAX_IMPORT_ROWS} rows at a time; split the file.
              </p>
            ) : null}
            <fieldset className="stack">
              <legend>Column mapping</legend>
              {FIELDS.map((f) => (
                <div className="field" key={f}>
                  <label htmlFor={`map-${f}`}>{FIELD_LABELS[f]}</label>
                  <select id={`map-${f}`} value={mapping[f]} onChange={(e) => changeMapping(f, e.target.value)}>
                    <option value={-1}>(not in file)</option>
                    {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                  </select>
                </div>
              ))}
            </fieldset>
            {mapping.email < 0 ? <p role="alert" className="error">Choose the email column.</p> : null}
            <div className="table-wrap">
              <table>
                <caption className="sr-only">Preview of the first rows</caption>
                <thead>
                  <tr>
                    <th scope="col">Email</th><th scope="col">First name</th><th scope="col">Last name</th>
                    <th scope="col">Index no</th><th scope="col">Phone</th>
                  </tr>
                </thead>
                <tbody>
                  {built.rows.slice(0, 5).map((r, i) => (
                    <tr key={i}>
                      <td>{r.email}</td><td>{r.first_name}</td><td>{r.last_name}</td>
                      <td>{r.index_no ?? ''}</td><td>{r.phone ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row">
              <button type="button" disabled={!canCheck} onClick={() => void run(true)}>Check</button>
              <button type="button" disabled={!canApply} onClick={() => setConfirming(true)}>Apply</button>
            </div>
          </>
        ) : null}

        {result ? (
          <div className="stack">
            {applied ? (
              <p role="status" className="banner">
                Import applied: {result.add.length} added, {result.update.length} updated.{' '}
                <Link to={membersPath} onClick={() => void reloadCohorts()}>View {role === 'student' ? 'students' : 'instructors'}</Link>
              </p>
            ) : (
              <p role="status">Check complete. Nothing has been changed yet.</p>
            )}
            <Diff result={result} lines={built.sourceLines} />
          </div>
        ) : null}
      </section>

      <AddOne role={role} />

      {confirming && result ? (
        <Dialog
          title="Apply import"
          submitLabel="Apply import"
          busy={busy}
          onCancel={() => setConfirming(false)}
          onSubmit={() => void run(false)}
        >
          <p>
            Add {result.add.length} and update {result.update.length} {role === 'student' ? 'students' : 'instructors'} in
            cohort {cohort.code}?
          </p>
        </Dialog>
      ) : null}
    </div>
  );
}
