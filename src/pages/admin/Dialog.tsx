import { useId, type FormEvent, type ReactNode } from 'react';

interface DialogProps {
  title: string;
  children: ReactNode;
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel: string;
  busy?: boolean;
  error?: string | null;
  /** Extra class on the dialog card, e.g. `dialog-wide`. */
  className?: string;
  /** Show only the submit button (list-style dialogs with a Done button). */
  hideCancel?: boolean;
}

/** Simple modal form dialog (confirm dialogs reuse it with a text body). */
export function Dialog({ title, children, onCancel, onSubmit, submitLabel, busy, error, className, hideCancel }: DialogProps) {
  const titleId = useId();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };
  return (
    <div className="dialog-backdrop">
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className={`card dialog${className ? ` ${className}` : ''}`}>
        <form className="stack" onSubmit={submit}>
          <h2 id={titleId}>{title}</h2>
          {children}
          {error ? <p role="alert" className="error">{error}</p> : null}
          <div className="row">
            {hideCancel ? null : <button type="button" onClick={onCancel} disabled={busy}>Cancel</button>}
            <button type="submit" disabled={busy}>{submitLabel}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
