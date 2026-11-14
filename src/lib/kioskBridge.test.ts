import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BRIDGE_SCRIPT, bridgeMain, sendToBridge } from './kioskBridge';
import { buildSrcDoc } from '../components/ContentFrame';

/** A fake iframe window around the test document: listeners, parent.postMessage and scrollTo are captured. */
function fakeWindow() {
  const listeners: Record<string, ((e: unknown) => void)[]> = {};
  const parent = { postMessage: vi.fn() };
  const win = {
    document,
    parent,
    innerWidth: 800,
    innerHeight: 600,
    scrollY: 0,
    scrollTo: vi.fn(),
    setTimeout: (fn: () => void, ms: number) => window.setTimeout(fn, ms),
    addEventListener: (type: string, fn: (e: unknown) => void) => {
      (listeners[type] ??= []).push(fn);
    },
  };
  const fire = (type: string, e: unknown) => listeners[type]?.forEach((fn) => fn(e));
  const down = (data: Record<string, unknown>, source: unknown = parent) => fire('message', { source, data: { type: 'ios-bridge', dir: 'down', ...data } });
  return { win, parent, fire, down };
}
const sent = (parent: { postMessage: ReturnType<typeof vi.fn> }) => parent.postMessage.mock.calls.map((c) => c[0] as Record<string, unknown>);

beforeEach(() => {
  document.body.innerHTML = `
    <h1>Swift</h1>
    <p>One</p><p>Two</p>
    <input id="name" value="">
    <details id="more"><summary>More</summary><p>Hidden</p></details>
    <section><button>Run</button><button>Stop</button></section>`;
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('bridge script', () => {
  it('is self-contained and injected only when asked', () => {
    expect(() => new Function(BRIDGE_SCRIPT.replace(/^<script>/, '').replace(/<\/script>$/, ''))).not.toThrow();
    expect(BRIDGE_SCRIPT).not.toMatch(/<\/script>[\s\S]*<\/script>/);
    expect(buildSrcDoc('<p>x</p>')).not.toContain('ios-bridge');
    expect(buildSrcDoc('<p>x</p>', { bridge: true })).toContain('ios-bridge');
  });

  it('says ready, then reports the person\'s input and toggles with a css path', () => {
    const { win, parent } = fakeWindow();
    bridgeMain(win as unknown as Window);
    expect(sent(parent)[0]).toMatchObject({ type: 'ios-bridge', dir: 'up', ev: 'ready', w: 800, h: 600 });

    const input = document.getElementById('name') as HTMLInputElement;
    input.value = 'Ada';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const msg = sent(parent).find((m) => m['ev'] === 'input')!;
    expect(msg).toMatchObject({ path: '#name', value: 'Ada' });
    expect(document.querySelector(msg['path'] as string)).toBe(input);
  });

  it('builds nth-of-type paths that resolve to the same element', () => {
    const { win, parent, down } = fakeWindow();
    bridgeMain(win as unknown as Window);
    const stop = document.querySelectorAll('button')[1]!;
    const onClick = vi.fn();
    stop.addEventListener('click', onClick);
    down({ op: 'click', path: 'body>section:nth-of-type(1)>button:nth-of-type(2)', x: 0.5, y: 0.5 });
    expect(onClick).toHaveBeenCalledTimes(1);
    // A replayed click is not reported back up.
    expect(sent(parent).some((m) => m['ev'] === 'click')).toBe(false);
  });

  it('replays input and toggle, and ignores messages not from the parent', () => {
    const { win, parent, down } = fakeWindow();
    bridgeMain(win as unknown as Window);
    const changed = vi.fn();
    document.getElementById('name')!.addEventListener('change', changed);
    down({ op: 'input', path: '#name', value: 'Grace' });
    expect((document.getElementById('name') as HTMLInputElement).value).toBe('Grace');
    expect(changed).toHaveBeenCalled();
    expect(sent(parent).some((m) => m['ev'] === 'input')).toBe(false);

    down({ op: 'toggle', path: '#more', open: true });
    expect((document.getElementById('more') as HTMLDetailsElement).open).toBe(true);

    down({ op: 'input', path: '#name', value: 'Evil' }, {});
    expect((document.getElementById('name') as HTMLInputElement).value).toBe('Grace');
  });

  it('rejects bad paths and unknown ops', () => {
    const { win, down } = fakeWindow();
    bridgeMain(win as unknown as Window);
    const onClick = vi.fn();
    document.querySelector('button')!.addEventListener('click', onClick);
    down({ op: 'click', path: 'button[onclick]', x: 0, y: 0 });
    down({ op: 'eval', code: 'alert(1)' });
    down({ op: 'input', path: '#name', value: 'x'.repeat(2001) });
    expect(onClick).not.toHaveBeenCalled();
    expect((document.getElementById('name') as HTMLInputElement).value).toBe('');
  });

  it('scrolls by fraction when there is no anchor', () => {
    const { win, down } = fakeWindow();
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 1600 });
    bridgeMain(win as unknown as Window);
    down({ op: 'scroll', anchor: null, offset: 0, fraction: 0.5 });
    expect(win.scrollTo).toHaveBeenCalledWith(0, 500);
  });

  it('sendToBridge posts a down message to the frame', () => {
    const postMessage = vi.fn();
    sendToBridge({ contentWindow: { postMessage } } as unknown as HTMLIFrameElement, { type: 'tap', x: 0.2, y: 0.3 });
    expect(postMessage).toHaveBeenCalledWith({ type: 'ios-bridge', dir: 'down', op: 'tap', x: 0.2, y: 0.3 }, '*');
  });
});
