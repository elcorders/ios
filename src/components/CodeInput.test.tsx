import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CodeInput } from './CodeInput';

function Harness() {
  const [v, setV] = useState('');
  return <CodeInput id="c" label="Code" value={v} onChange={setV} />;
}

describe('CodeInput', () => {
  it('has numeric keyboard and one-time-code autofill', () => {
    render(<Harness />);
    const input = screen.getByLabelText('Code');
    expect(input).toHaveAttribute('inputmode', 'numeric');
    expect(input).toHaveAttribute('autocomplete', 'one-time-code');
  });
  it('keeps only 6 digits when typing', () => {
    render(<Harness />);
    const input = screen.getByLabelText('Code');
    fireEvent.change(input, { target: { value: '12a34567' } });
    expect(input).toHaveValue('123456');
  });
  it('handles paste with spaces', () => {
    render(<Harness />);
    const input = screen.getByLabelText('Code');
    fireEvent.paste(input, { clipboardData: { getData: () => ' 123 456 ' } });
    expect(input).toHaveValue('123456');
  });
});
