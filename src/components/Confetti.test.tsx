import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { Confetti, fireConfetti } from './Confetti';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('fireConfetti', () => {
  it('does nothing with reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    expect(fireConfetti()).toBe(false);
    expect(document.querySelector('canvas')).toBeNull();
  });

  it('mounts a click-through canvas and removes it afterwards', () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(fireConfetti()).toBe(true);
    const c = document.querySelector('canvas')!;
    expect(c).not.toBeNull();
    expect(c.style.pointerEvents).toBe('none');
    vi.advanceTimersByTime(2000);
    expect(document.querySelector('canvas')).toBeNull();
  });

  it('component fires when run is true', () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    render(<Confetti run />);
    expect(document.querySelector('canvas')).not.toBeNull();
  });
});
