import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import type { PushKind, PushLogRow, PushRecipient, PushStats } from '../../api/types';
import { messageFor } from '../../lib/errors';
import { usePushState } from '../../lib/push';
import { formatColombo } from '../../lib/time';
import { useAdmin } from './AdminContext';
import { Dialog } from './Dialog';
import '../admin/table/table.css';

const KIND_INFO: Record<string, { label: string; text: string }> = {
  class_reminder: { label: 'Class reminder', text: '18:00 the evening before a class, to each slot\'s groups.' },
  content_released: { label: 'New content', text: 'When a tutorial or material you chose to announce opens.' },
  booking_confirmed: { label: 'Lab booked', text: 'Right after a student books lab time.' },
  booking_reminder: { label: 'Lab reminder', text: '24 hours before a lab booking.' },
  booking_soon: { label: 'Lab starting soon', text: '15 minutes before a lab booking starts.' },
  group_changed: { label: 'Group changed', text: 'When a group change is decided or a student is moved.' },
  lab_closed: { label: 'Lab closed', text: 'When a closure cancels a student\'s booking.' },
  no_show: { label: 'No-show', text: 'Missed lab session (when no-show tracking exists).' },
  custom: { label: 'Messages', text: 'Messages you send from this page.' },
};

const LINKS: { label: string; url: string | null }[] = [
  { label: 'None', url: null },
  { label: 'Home', url: '/#/' },
  { label: 'Lab', url: '/#/lab' },
  { label: 'Tutorials', url: '/#/tutorials' },
  { label: 'Materials', url: '/#/materials' },
  { label: 'Notifications', url: '/#/notifications' },
];

/** Admin › Notifications (§S16): push stats and a test to the signed-in admin. */
export function NotificationsPage() {
  const { cohort, readOnly } = useAdmin();
  const push = usePushState();
  const [stats, setStats] = useState<PushStats | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [needsDevice, setNeedsDevice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logTick, setLogTick] = useState(0);

  const loadStats = useCallback(async () => {
    const r = await api.adminPushStats();
    if (r.ok) setStats(r.data);
    else setError('Could not load notification stats.');
  }, []);
  useEffect(() => {
    let live = true;
    void api.adminPushStats().then((r) => {
      if (!live) return;
      if (r.ok) setStats(r.data);
      else setError('Could not load notification stats.');
    });
    return () => {
      live = false;
    };
  }, []);

  async function sendTest() {
    setBusy(true);
    setResult(null);
    setError(null);
    setNeedsDevice(false);
    const t = await api.adminPushTest();
    if (!t.ok) {
      if (t.error.code === 'no_devices') {
        setNeedsDevice(true);
        setResult('Turn on notifications on this device first.');
      } else setError('Could not queue the test.');
      setBusy(false);
      return;
    }
    const s = await api.adminPushSend();
    if (!s.ok) setError('Could not send the test.');
    else if (s.data.sent > 0) setResult(`Sent to ${s.data.sent} device(s).`);
    else if (s.data.skipped > 0) setResult('Not sent: push keys not set on the server.');
    else if (s.data.failed > 0) setResult(`Failed for ${s.data.failed} device(s).`);
    else setResult('Nothing to send.');
    setBusy(false);
    void loadStats();
  }

  return (
    <section className="card stack" aria-label="Notifications">
      <h2>Notifications</h2>
      <p className="muted">Students get reminders and updates automatically. Switch types off below, or send your own message.</p>
      {stats ? (
        <ul aria-label="Push stats">
          <li>Students with push: {stats.students_with_push} of {stats.students}</li>
          <li>Devices: {stats.devices}</li>
          <li>Queued: {stats.queued}</li>
        </ul>
      ) : null}
      {error ? <p role="alert" className="error">{error}</p> : null}
      <button type="button" className="primary" disabled={busy} onClick={() => void sendTest()}>Send test to me</button>
      {result ? <p role="status">{result}</p> : null}
      {needsDevice && (push.support === 'default' || push.support === 'granted') ? (
        <button
          type="button"
          disabled={push.busy}
          onClick={async () => {
            if (await push.enable()) {
              setNeedsDevice(false);
              setResult('This device is ready. Send the test again.');
              void loadStats();
            }
          }}
        >
          Turn on notifications on this device
        </button>
      ) : null}
      {needsDevice && push.support === 'unsupported' ? <p className="muted">Push is not available in this browser or build.</p> : null}
      {push.error ? <p role="alert" className="error">{push.error}</p> : null}
      <Types stats={stats} onError={setError} />
      <SendMessage cohortId={cohort.id} cohortCode={cohort.code} readOnly={readOnly} onSent={() => { void loadStats(); setLogTick((n) => n + 1); }} />
      <Recent tick={logTick} />
    </section>
  );
}

function Types({ stats, onError }: { stats: PushStats | null; onError: (m: string) => void }) {
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  if (!stats) return null;
  const on = (k: PushKind, base: boolean) => overrides[k] ?? base;
  async function flip(kind: PushKind, enabled: boolean) {
    setOverrides((o) => ({ ...o, [kind]: enabled }));
    const r = await api.adminSetPushKind(kind, enabled);
    if (!r.ok) {
      setOverrides((o) => ({ ...o, [kind]: !enabled }));
      onError(messageFor(r.error));
    }
  }
  return (
    <fieldset className="stack notif-types">
      <legend><h3>Types</h3></legend>
      {stats.kinds.map((k) => {
        const info = KIND_INFO[k.kind] ?? { label: k.kind, text: '' };
        return (
          <label key={k.kind} className="row notif-type">
            <input type="checkbox" role="switch" checked={on(k.kind, k.enabled)} onChange={(e) => void flip(k.kind, e.target.checked)} />
            <span>
              <strong>{info.label}</strong>
              <small className="muted"> {info.text}</small>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

function SendMessage({ cohortId, cohortCode, readOnly, onSent }: { cohortId: string; cohortCode: string; readOnly: boolean; onSent: () => void }) {
  const [groups, setGroups] = useState<number[]>([]);
  const [mode, setMode] = useState<'all' | 'groups' | 'one'>('all');
  const [picked, setPicked] = useState<number[]>([]);
  const [student, setStudent] = useState<PushRecipient | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [audience, setAudience] = useState<{ students: number; with_push: number } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void api.adminListSurvey(cohortId).then((g) => {
      if (live && g.ok) setGroups(g.data.groups.map((x) => x.no));
    });
    return () => {
      live = false;
    };
  }, [cohortId]);

  const groupNos = mode === 'groups' ? [...picked].sort((a, b) => a - b) : null;
  const needGroups = mode === 'groups' && picked.length === 0;
  const needStudent = mode === 'one' && !student;
  const userId = mode === 'one' ? student?.user_id ?? null : null;
  const groupKey = groupNos ? groupNos.join(',') : 'all';
  useEffect(() => {
    if (needGroups || needStudent) return;
    let live = true;
    void api.adminPushAudience(cohortId, groupKey === 'all' ? null : groupKey.split(',').map(Number), userId).then((r) => {
      if (live) setAudience(r.ok ? r.data : null);
    });
    return () => {
      live = false;
    };
  }, [cohortId, groupKey, needGroups, needStudent, userId]);

  const shown = needGroups || needStudent ? null : audience;
  const who = mode === 'one' && student ? recipientName(student) : null;

  function ask() {
    setResult(null);
    if (!title.trim()) return setError('Add a title.');
    if (!body.trim()) return setError('Write a message.');
    if (needGroups) return setError('Pick at least one group.');
    if (needStudent) return setError('Pick a student.');
    setError(null);
    setConfirm(true);
  }

  async function send() {
    setBusy(true);
    const r = await api.adminPushCustom({ cohort_id: cohortId, group_nos: groupNos, user_id: userId, title: title.trim(), body: body.trim(), url: link || null });
    if (!r.ok) {
      setConfirm(false);
      setBusy(false);
      setError(messageFor(r.error));
      return;
    }
    const s = await api.adminPushSend();
    setConfirm(false);
    setBusy(false);
    setError(null);
    const queuedText = who
      ? `Sent to ${who}${r.data.with_push > 0 ? '' : ' (inbox only — notifications are off for them)'}.`
      : `Sent to ${r.data.queued} ${r.data.queued === 1 ? 'student' : 'students'} (${r.data.with_push} with notifications on).`;
    setResult(s.ok ? queuedText : `${queuedText} Delivery will retry shortly.`);
    setTitle('');
    setBody('');
    setLink('');
    onSent();
  }

  return (
    <>
      <form className="stack notif-send" aria-label="Send a message" onSubmit={(e) => { e.preventDefault(); ask(); }}>
        <h3>Send a message</h3>
        <p className="muted">Cohort {cohortCode}</p>
        <fieldset className="stack">
          <legend>Audience</legend>
          <label className="row"><input type="radio" name="aud" checked={mode === 'all'} onChange={() => setMode('all')} /> All students</label>
          <label className="row"><input type="radio" name="aud" checked={mode === 'groups'} onChange={() => setMode('groups')} /> Groups</label>
          <label className="row"><input type="radio" name="aud" checked={mode === 'one'} onChange={() => setMode('one')} /> One student</label>
          {mode === 'groups' ? (
            <div className="check-row">
              {groups.map((g) => (
                <label key={g}>
                  <input type="checkbox" checked={picked.includes(g)} onChange={() => setPicked(picked.includes(g) ? picked.filter((x) => x !== g) : [...picked, g])} />
                  <span>G{g}</span>
                </label>
              ))}
            </div>
          ) : null}
          {mode === 'one' ? <StudentPicker cohortId={cohortId} value={student} onChange={setStudent} /> : null}
        </fieldset>
        <p role="status" aria-label="Audience">
          {needGroups ? 'Pick at least one group.'
            : needStudent ? 'Pick a student.'
            : who && shown ? `${who} · ${shown.with_push > 0 ? 'notifications on' : 'notifications off (inbox only)'}`
            : shown ? `${shown.students} students · ${shown.with_push} with notifications on` : '…'}
        </p>
        <div className="field"><label htmlFor="np-title">Title</label><input id="np-title" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div className="field"><label htmlFor="np-body">Message</label><textarea id="np-body" rows={3} maxLength={300} value={body} onChange={(e) => setBody(e.target.value)} /></div>
        <div className="field">
          <label htmlFor="np-link">Link</label>
          <select id="np-link" value={link} onChange={(e) => setLink(e.target.value)}>
            {LINKS.map((l) => <option key={l.label} value={l.url ?? ''}>{l.label}</option>)}
          </select>
        </div>
        {error ? <p role="alert" className="error">{error}</p> : null}
        {result ? <p role="status">{result}</p> : null}
        <div className="row"><button type="submit" className="primary" disabled={readOnly || busy}>Send message</button></div>
      </form>
      {confirm ? (
        <Dialog title={who ? `Send to ${who}?` : `Send to ${shown?.students ?? 0} students?`} submitLabel="Send" onCancel={() => setConfirm(false)} onSubmit={() => void send()} busy={busy}>
          <p><strong>{title.trim()}</strong></p>
          <p>{body.trim()}</p>
        </Dialog>
      ) : null}
    </>
  );
}

const recipientName = (r: PushRecipient) => r.name ?? r.email;

/** Search the cohort's registered students and pick one (S20). */
function StudentPicker({ cohortId, value, onChange }: { cohortId: string; value: PushRecipient | null; onChange: (r: PushRecipient | null) => void }) {
  const [all, setAll] = useState<PushRecipient[] | null>(null);
  const [q, setQ] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    void api.adminPushRecipients(cohortId).then((r) => {
      if (!live) return;
      if (r.ok) setAll(r.data);
      else setFailed(true);
    });
    return () => {
      live = false;
    };
  }, [cohortId]);

  if (value) {
    return (
      <div className="row picked-student">
        <span>
          <strong>{recipientName(value)}</strong>
          <small className="muted"> {[value.index_no, value.group_no !== null ? `G${value.group_no}` : null].filter(Boolean).join(' · ')}</small>
        </span>
        <button type="button" onClick={() => onChange(null)} aria-label={`Change student (${recipientName(value)})`}>Change</button>
      </div>
    );
  }
  const needle = q.trim().toLowerCase();
  const matches = (all ?? []).filter((r) =>
    !needle || [r.name, r.email, r.index_no].some((v) => v?.toLowerCase().includes(needle)));
  return (
    <div className="stack student-picker">
      <div className="field">
        <label htmlFor="np-student">Find a student</label>
        <input id="np-student" type="search" placeholder="Name, email or index number" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
      </div>
      {failed ? <p role="alert" className="error">Could not load students.</p> : null}
      {all === null && !failed ? <p className="muted">Loading students…</p> : null}
      {all !== null && all.length === 0 ? <p className="muted">No registered students in this cohort yet.</p> : null}
      {all !== null && all.length > 0 ? (
        <ul className="student-matches" aria-label="Matching students">
          {matches.slice(0, 8).map((r) => (
            <li key={r.user_id}>
              <button type="button" onClick={() => onChange(r)}>
                <span className="student-name">{recipientName(r)}</span>
                <small className="muted">
                  {[r.index_no, r.group_no !== null ? `G${r.group_no}` : 'No group', r.with_push ? 'notifications on' : 'inbox only'].filter(Boolean).join(' · ')}
                </small>
              </button>
            </li>
          ))}
          {matches.length === 0 ? <li className="muted">No match.</li> : null}
          {matches.length > 8 ? <li className="muted">{matches.length - 8} more — keep typing.</li> : null}
        </ul>
      ) : null}
    </div>
  );
}

function Recent({ tick }: { tick: number }) {
  const [rows, setRows] = useState<PushLogRow[] | null>(null);
  useEffect(() => {
    let live = true;
    void api.adminPushLog().then((r) => {
      if (live && r.ok) setRows(r.data);
    });
    return () => {
      live = false;
    };
  }, [tick]);
  return (
    <section className="stack" aria-label="Recent notifications">
      <h3>Recent</h3>
      <div className="table-wrap admin-table">
        <table>
          <caption className="sr-only">Recent notification batches</caption>
          <thead>
            <tr><th scope="col">When</th><th scope="col">Type</th><th scope="col">Title</th><th scope="col">Total</th><th scope="col">Sent</th><th scope="col">Failed</th><th scope="col">Skipped</th><th scope="col">Queued</th></tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r, i) => (
              <tr key={`${r.created_at}-${i}`}>
                <td>{formatColombo(r.created_at)}</td>
                <td>{KIND_INFO[r.kind]?.label ?? r.kind}</td>
                <td className="c-wide">{r.title}</td>
                <td>{r.total}</td><td>{r.sent}</td><td>{r.failed}</td><td>{r.skipped}</td><td>{r.queued}</td>
              </tr>
            ))}
            {rows && rows.length === 0 ? <tr><td colSpan={8}>Nothing sent yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
