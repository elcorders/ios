import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Health, shortSha } from './Health';

describe('Health', () => {
  it('shortens sha with dev fallback', () => {
    expect(shortSha('0123456789abcdef')).toBe('0123456');
    expect(shortSha(undefined)).toBe('dev');
    expect(shortSha('')).toBe('dev');
  });
  it('shows app, commit, build time and adapter', async () => {
    render(<Health />);
    expect(screen.getByTestId('app-name')).toHaveTextContent('NIBM iOS');
    expect(screen.getByTestId('commit').textContent).toMatch(/^[0-9a-f]{7}$|^dev$/);
    expect(screen.getByTestId('built').textContent).not.toBe('');
    expect(await screen.findByText('mock')).toBeInTheDocument();
  });
});
