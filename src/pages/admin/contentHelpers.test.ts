import { describe, expect, it } from 'vitest';
import { hasFrameNavigation } from './contentHelpers';

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
