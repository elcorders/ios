import { useId } from 'react';

interface Props {
  /** "Publish" or "Schedule". */
  verb: string;
  busy?: boolean;
  error?: string | null;
  onChoose: (notify: boolean) => void;
  onCancel: () => void;
}

/** "Notify students when it opens?" (§S19). */
export function NotifyChoice({ verb, busy, error, onChoose, onCancel }: Props) {
  const titleId = useId();
  return (
    <div className="dialog-backdrop">
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="card dialog stack">
        <h2 id={titleId}>Notify students when it opens?</h2>
        {error ? <p role="alert" className="error">{error}</p> : null}
        <div className="row">
          <button type="button" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" disabled={busy} onClick={() => onChoose(false)}>{verb} without notifying</button>
          <button type="button" className="primary" disabled={busy} onClick={() => onChoose(true)}>{verb} and notify</button>
        </div>
      </div>
    </div>
  );
}
