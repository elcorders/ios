import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Install } from './Install';
import { _setDeferredPromptForTest, type BeforeInstallPromptEvent } from '../lib/pwa';

function setUa(ua: string) {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
}
const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/120.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36';

afterEach(() => {
  vi.unstubAllGlobals();
  _setDeferredPromptForTest(null);
});

describe('Install page', () => {
  it('shows Safari steps on iPhone', () => {
    setUa(IPHONE_SAFARI);
    render(<Install />);
    expect(screen.getByTestId('steps-ios')).toHaveTextContent('Add to Home Screen');
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();
    expect(screen.getByText(/sign in once with your passkey/)).toBeInTheDocument();
  });
  it('tells iOS non-Safari users to open Safari', () => {
    setUa(IPHONE_CHROME);
    render(<Install />);
    expect(screen.getByRole('heading', { name: /Open this page in Safari/ })).toBeInTheDocument();
  });
  it('shows Android steps and an Install button when the prompt fired', async () => {
    setUa(ANDROID);
    render(<Install />);
    expect(screen.getByTestId('steps-android')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();
    const prompt = vi.fn().mockResolvedValue(undefined);
    act(() =>
      _setDeferredPromptForTest({ prompt, userChoice: Promise.resolve({ outcome: 'accepted' }) } as unknown as BeforeInstallPromptEvent),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    expect(prompt).toHaveBeenCalled();
  });
  it('shows already installed when standalone', () => {
    setUa(ANDROID);
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    render(<Install />);
    expect(screen.getByText(/Already installed/)).toBeInTheDocument();
    expect(screen.queryByTestId('steps-android')).toBeNull();
  });
});
