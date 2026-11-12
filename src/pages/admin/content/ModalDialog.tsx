import { useId, type FormEvent, type ReactNode } from 'react';

interface Props {
  title: string;
  children: ReactNode;
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  error?: string | null;
}

/** Same look as Dialog, with a custom cancel label ("Not now"). */
export function ModalDialog({ title, children, onCancel, onSubmit, submitLabel, cancelLabel = 'Cancel', busy, error }: Props) {
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
            <button type="button" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
            <button type="submit" disabled={busy}>{submitLabel}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
