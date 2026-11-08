import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { ContentFrame, buildSrcDoc } from './ContentFrame';

describe('ContentFrame', () => {
  it('uses the exact sandbox without allow-same-origin', () => {
    render(<ContentFrame html="<p>hi</p>" title="My item" />);
    const f = screen.getByTitle('My item');
    expect(f.getAttribute('sandbox')).toBe('allow-scripts allow-popups allow-popups-to-escape-sandbox');
    expect(f.getAttribute('sandbox')).not.toContain('allow-same-origin');
  });
  it('injects base and height script', () => {
    const doc = buildSrcDoc('<html><head></head><body><p>x</p></body></html>');
    expect(doc).toContain('<base target="_blank">');
    expect(doc).toContain('ios-content-height');
    expect(doc.indexOf('ios-content-height')).toBeLessThan(doc.indexOf('</body>'));
    expect(buildSrcDoc('<p>frag</p>')).toContain('ios-content-height');
  });
  it('accepts height only from its own frame and clamps', () => {
    render(<ContentFrame html="<p>hi</p>" title="T" />);
    const f = screen.getByTitle('T') as HTMLIFrameElement;
    const send = (source: MessageEventSource | null, height: unknown) =>
      act(() => {
        window.dispatchEvent(new MessageEvent('message', { data: { type: 'ios-content-height', height }, source }));
      });
    send(window, 900);
    expect(f.style.height).toBe('400px');
    send(f.contentWindow, 900);
    expect(f.style.height).toBe('900px');
    send(f.contentWindow, 99999999);
    expect(f.style.height).toBe('20000px');
    send(f.contentWindow, 'abc');
    expect(f.style.height).toBe('20000px');
    send(f.contentWindow, 5);
    expect(f.style.height).toBe('120px');
  });
});
