import { describe, expect, it } from 'vitest';
import { hasFrameNavigation, statusLabel } from './contentHelpers';

const page = (js: string) => `<html><body><p>location.replace( in text is fine</p><script>${js}</script></body></html>`;

describe('hasFrameNavigation', () => {
  it.each([
    'location.replace(`#slide-${n}`)',
    "location.assign('#a')",
    "location.href = '#a'",
    "window.location = '#a'",
    "history.replaceState(null, '', '#a')",
    "history.pushState({}, '', '?x')",
  ])('flags %s', (js) => expect(hasFrameNavigation(page(js))).toBe(true));

  it.each([
    "location.hash = 'slide-2'",
    "if (location.href === 'x') {}",
    "const n = parseInt(location.hash.replace('#slide-',''), 10)",
    '',
  ])('allows %s', (js) => expect(hasFrameNavigation(page(js))).toBe(false));

  it('ignores text outside scripts', () => {
    expect(hasFrameNavigation('<p>location.replace(x)</p>')).toBe(false);
  });
});

describe('statusLabel', () => {
  it('formats on_session with the next session in Colombo time', () => {
    // 03:30 UTC = 09:00 in Colombo.
    expect(statusLabel({ status: 'on_session', published_at: null, release_at: '2026-11-13T03:30:00Z' })).toBe('On session · next 13 Nov 09:00');
  });
  it('keeps the old labels', () => {
    expect(statusLabel({ status: 'draft', published_at: null })).toBe('Draft');
    expect(statusLabel({ status: 'published', published_at: null })).toMatch(/^Published/);
  });
});
