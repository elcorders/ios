import { useId, type FormEvent, type ReactNode } from 'react';

interface DialogProps {
  title: string;
  children: ReactNode;
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel: string;
  busy?: boolean;
  error?: string | null;
}

/** Simple modal form dialog (confirm dialogs reuse it with a text body). */
export function Dialog({ title, children, onCancel, onSubmit, submitLabel, busy, error }: DialogProps) {
  const titleId = useId();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };
  return (
    <div className="dialog-backdrop">
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="card dialog">
        <form className="stack" onSubmit={submit}>
          <h2 id={titleId}>{title}</h2>
          {children}
          {error ? <p role="alert" className="error">{error}</p> : null}
          <div className="row">
            <button type="button" onClick={onCancel} disabled={busy}>Cancel</button>
            <button type="submit" disabled={busy}>{submitLabel}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
