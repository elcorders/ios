import { useState, type ReactNode } from 'react';
import type { Result } from '../../../api/types';
import { messageFor } from '../../../lib/errors';
import { Dialog } from '../Dialog';
import './table.css';

export interface BulkItem {
  id: string;
  label: string;
}

export interface BulkSummaryData {
  title: string;
  succeeded: number;
  failures: { label: string; message: string }[];
}

/** Sticky bar shown while rows are selected. */
export function BulkBar({ count, onClear, children }: { count: number; onClear: () => void; children: ReactNode }) {
  if (count === 0) return null;
  return (
    <div className="bulk-bar" role="region" aria-label="Bulk actions">
      <strong>{count} selected</strong>
      <div className="bulk-actions">{children}</div>
      <button type="button" className="link" onClick={onClear}>Clear</button>
    </div>
  );
}

/** Confirm dialog that runs one call per item, sequentially, with progress. */
export function BulkConfirm({ title, submitLabel, body, items, run, onCancel, onFinished }: {
  title: string;
  submitLabel: string;
  body: ReactNode;
  items: BulkItem[];
  run: (id: string) => Promise<Result<unknown>>;
  onCancel: () => void;
  onFinished: (summary: BulkSummaryData) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);

  const submit = async () => {
    setBusy(true);
    const failures: BulkSummaryData['failures'] = [];
    let succeeded = 0;
    for (const item of items) {
      let res: Result<unknown>;
      try {
        res = await run(item.id);
      } catch {
        res = { ok: false, error: { code: 'internal', message: 'failed' } };
      }
      if (res.ok) succeeded += 1;
      else failures.push({ label: item.label, message: messageFor(res.error) });
      setDone((d) => d + 1);
    }
    onFinished({ title, succeeded, failures });
  };

  return (
    <Dialog title={title} submitLabel={submitLabel} onCancel={onCancel} onSubmit={() => void submit()} busy={busy}>
      {body}
      {busy ? <p role="status">Processing {done} of {items.length}…</p> : null}
    </Dialog>
  );
}

export function BulkSummary({ summary, onDismiss }: { summary: BulkSummaryData; onDismiss: () => void }) {
  const failed = summary.failures.length;
  return (
    <div role={failed ? 'alert' : 'status'} className={failed ? 'bulk-summary has-failures' : 'bulk-summary'}>
      <p>
        {summary.title}: {summary.succeeded} succeeded{failed ? `, ${failed} failed` : ''}.
      </p>
      {failed ? (
        <ul>
          {summary.failures.map((f, i) => <li key={i}>{f.label}: {f.message}</li>)}
        </ul>
      ) : null}
      <button type="button" className="link" onClick={onDismiss}>Dismiss</button>
    </div>
  );
}
