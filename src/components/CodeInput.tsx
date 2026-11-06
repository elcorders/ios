import type { ClipboardEvent, ChangeEvent } from 'react';

export const CODE_LENGTH = 6;

export function sanitiseCode(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, CODE_LENGTH);
}

interface Props {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/** 6-digit one-time code field: numeric keyboard, OTP autofill, paste tolerant of spaces. */
export function CodeInput({ id, label, value, onChange, disabled }: Props) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => onChange(sanitiseCode(e.target.value));
  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    onChange(sanitiseCode(e.clipboardData.getData('text')));
  };
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="code-input"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={CODE_LENGTH + 4}
        value={value}
        disabled={disabled}
        onChange={handleChange}
        onPaste={handlePaste}
      />
    </div>
  );
}
