import { useId } from 'react';

export const NOTE_MAX = 500;

/** Optional admin note (emailed to the student), at most 500 characters. */
export function NoteField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>Note (optional, included in the email)</label>
      <textarea id={id} rows={3} maxLength={NOTE_MAX} value={value} onChange={(e) => onChange(e.target.value)} />
      <small>{value.length}/{NOTE_MAX}</small>
    </div>
  );
}
