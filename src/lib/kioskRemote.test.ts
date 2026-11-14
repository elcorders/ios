import { afterEach, describe, expect, it, vi } from 'vitest';
import { clampZoom, isCssPath, parseBridgeUp, parseCommand, parseCommandMessage, parseRemoteState, throttle } from './kioskRemote';

const LEASE = '00000000-0000-4000-8000-000000000001';
const DEV = '00000000-0000-4000-8000-000000002101';

describe('parseCommand', () => {
  it('accepts every known command', () => {
    const ok = [
      { type: 'hello' }, { type: 'reload' }, { type: 'release' },
      { type: 'navigate', view: 'home' }, { type: 'navigate', view: 'item', item_id: LEASE },
      { type: 'scroll', anchor: 'body>p:nth-of-type(2)', offset: 0.5, fraction: 0.2 },
      { type: 'scroll', anchor: null, offset: 0, fraction: 1 },
      { type: 'click', path: '#run', x: 0.1, y: 0.9 },
      { type: 'input', path: 'body>input:nth-of-type(1)', value: 'hello' },
      { type: 'toggle', path: '#more', open: true },
      { type: 'tap', x: 0, y: 1 }, { type: 'pointer', x: 0.5, y: 0.5, visible: false },
      { type: 'zoom', level: 1.5 }, { type: 'blank', on: true },
    ];
    for (const c of ok) expect(parseCommand(c)).toEqual(c);
  });

  it('rejects unknown types, bad ranges and unsafe paths', () => {
    const bad = [
      null, 'hello', { type: 'eval', code: 'x' }, { type: 'navigate', view: 'item', item_id: '../admin' },
      { type: 'navigate', view: 'admin' }, { type: 'scroll', anchor: null, offset: 2, fraction: 0 },
      { type: 'scroll', anchor: 'a[href="x"]', offset: 0, fraction: 0 }, { type: 'click', path: '', x: 0, y: 0 },
      { type: 'click', path: '#a', x: Number.NaN, y: 0 }, { type: 'input', path: '#a', value: 'x'.repeat(2001) },
      { type: 'toggle', path: '#a', open: 'yes' }, { type: 'zoom', level: 4 }, { type: 'zoom', level: 0.1 },
      { type: 'blank' }, { type: 'pointer', x: 0, y: 0 },
    ];
    for (const c of bad) expect(parseCommand(c)).toBeNull();
  });

  it('drops extra fields', () => {
    expect(parseCommand({ type: 'blank', on: false, html: '<script>' })).toEqual({ type: 'blank', on: false });
  });
});

describe('parseCommandMessage', () => {
  it('needs v 1, a uuid lease and a non-negative integer seq', () => {
    expect(parseCommandMessage({ v: 1, lease_id: LEASE, seq: 3, cmd: { type: 'hello' } })).toEqual({ v: 1, lease_id: LEASE, seq: 3, cmd: { type: 'hello' } });
    expect(parseCommandMessage({ v: 2, lease_id: LEASE, seq: 3, cmd: { type: 'hello' } })).toBeNull();
    expect(parseCommandMessage({ v: 1, lease_id: 'x', seq: 3, cmd: { type: 'hello' } })).toBeNull();
    expect(parseCommandMessage({ v: 1, lease_id: LEASE, seq: 1.5, cmd: { type: 'hello' } })).toBeNull();
    expect(parseCommandMessage({ v: 1, lease_id: LEASE, seq: 1, cmd: { type: 'nope' } })).toBeNull();
  });
});

describe('parseRemoteState', () => {
  const base = {
    v: 1, device_id: DEV, lease_id: LEASE, controller_name: 'Test A.', ack_seq: 2, view: 'item', item_id: LEASE,
    item_title: 'Swift basics', scroll: { anchor: null, offset: 0, fraction: 0.3 }, zoom: 1, blank: false, viewport: { w: 1920, h: 1080 },
  };
  it('keeps a valid state and its menu', () => {
    const menu = [{ id: LEASE, kind: 'tutorial', title: 'Swift basics' }];
    expect(parseRemoteState({ ...base, menu })).toEqual({ ...base, menu });
    expect(parseRemoteState(base)).toEqual(base);
  });
  it('rejects broken states', () => {
    expect(parseRemoteState({ ...base, view: 'admin' })).toBeNull();
    expect(parseRemoteState({ ...base, zoom: 9 })).toBeNull();
    expect(parseRemoteState({ ...base, scroll: null })).toBeNull();
    expect(parseRemoteState({ ...base, menu: [{ id: LEASE, kind: 'secret', title: 'x' }] })).toBeNull();
    expect(parseRemoteState({ ...base, device_id: 1 })).toBeNull();
  });
});

describe('parseBridgeUp', () => {
  it('only accepts ios-bridge up messages of known events', () => {
    expect(parseBridgeUp({ type: 'ios-bridge', dir: 'up', ev: 'click', path: '#a', x: 0.5, y: 0.5 })).toEqual({ ev: 'click', path: '#a', x: 0.5, y: 0.5 });
    expect(parseBridgeUp({ type: 'ios-bridge', dir: 'up', ev: 'ready', w: 100, h: 50 })).toEqual({ ev: 'ready', w: 100, h: 50 });
    expect(parseBridgeUp({ type: 'ios-bridge', dir: 'down', ev: 'click', path: '#a', x: 0.5, y: 0.5 })).toBeNull();
    expect(parseBridgeUp({ type: 'ios-content-height', height: 10 })).toBeNull();
    expect(parseBridgeUp({ type: 'ios-bridge', dir: 'up', ev: 'navigate', url: 'https://evil.example' })).toBeNull();
  });
});

describe('helpers', () => {
  afterEach(() => vi.useRealTimers());
  it('css path grammar', () => {
    expect(isCssPath('main>section:nth-of-type(2)>p:nth-of-type(1)')).toBe(true);
    expect(isCssPath('#id')).toBe(true);
    expect(isCssPath('a[onclick]')).toBe(false);
    expect(isCssPath('x'.repeat(501))).toBe(false);
  });
  it('clampZoom', () => {
    expect(clampZoom(10)).toBe(3);
    expect(clampZoom(0.1)).toBe(0.5);
    expect(clampZoom(1.234)).toBe(1.23);
  });
  it('throttle delivers the first and the last call', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const t = throttle(fn, 50);
    t(1);
    t(2);
    t(3);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith(3);
    t(4); // within 50 ms of the last delivery: queued, then cancelled
    t.cancel();
    vi.advanceTimersByTime(60);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
