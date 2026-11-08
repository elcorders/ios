import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectPlatform, isStandalone } from './pwa';

const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
const ANDROID_SAMSUNG = 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0 Mobile Safari/537.36';
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

describe('detectPlatform', () => {
  it('detects platforms', () => {
    expect(detectPlatform(IPHONE_SAFARI)).toBe('ios-safari');
    expect(detectPlatform(IPHONE_CHROME)).toBe('ios-other');
    expect(detectPlatform(IPAD_DESKTOP_UA, 5)).toBe('ios-safari');
    expect(detectPlatform(IPAD_DESKTOP_UA, 0)).toBe('desktop');
    expect(detectPlatform(ANDROID_CHROME)).toBe('android-chrome');
    expect(detectPlatform(ANDROID_SAMSUNG)).toBe('android-other');
    expect(detectPlatform(DESKTOP)).toBe('desktop');
  });
});

describe('isStandalone', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(navigator, 'standalone', { value: undefined, configurable: true });
  });
  it('is false in a normal tab', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(isStandalone()).toBe(false);
  });
  it('is true for display-mode standalone', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    expect(isStandalone()).toBe(true);
  });
  it('is true for iOS navigator.standalone', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
    expect(isStandalone()).toBe(true);
  });
});
