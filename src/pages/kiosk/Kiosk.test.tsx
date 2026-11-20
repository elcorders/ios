import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from '../../routes';
import { api } from '../../api';
import { notImplemented } from '../../api/stub';
import { resetMockKiosk } from '../../api/mock/kiosk';
import type { KioskRecord } from '../../lib/kioskKey';
import { colomboAt, colomboDate } from '../../lib/kiosk';

// The key store needs IndexedDB; the page logic is tested against an in-memory record.
const store = vi.hoisted(() => ({ rec: null as null | Record<string, unknown>, insecure: false }));
vi.mock('../../lib/kioskKey', async (orig) => {
  const real = await orig<typeof import('../../lib/kioskKey')>();
  const fresh = () => ({ device_id: null, pairing_id: null, keys: {}, public_jwk: { kty: 'EC', crv: 'P-256', x: 'x'.repeat(43), y: 'y'.repeat(43) } });
  return {
    ...real,
    kioskCryptoAvailable: () => !store.insecure,
    getOrCreateRecord: async () => (store.rec ??= fresh()) as unknown as KioskRecord,
    updateRecord: async (patch: object) => (store.rec = { ...(store.rec ?? fresh()), ...patch }) as unknown as KioskRecord,
    forget: async () => {
      store.rec = null;
    },
    sign: async () => new Uint8Array(64),
  };
});

function open(path: string) {
  window.location.hash = `#${path}`;
  return render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
}
const paired = () => {
  store.rec = { device_id: '00000000-0000-4000-8000-000000002101', pairing_id: null, keys: {}, public_jwk: { kty: 'EC', crv: 'P-256', x: 'x', y: 'y' } };
};

beforeEach(() => {
  store.rec = null;
  store.insecure = false;
  resetMockKiosk();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('S21 kiosk routes', () => {
  it('is full screen, outside the app layout', async () => {
    open('/kiosk');
    expect(await screen.findByRole('heading', { name: 'Activate this screen' })).toBeInTheDocument();
    expect(screen.queryByRole('banner')).toBeNull();
  });
  it('/kiosk/pair needs a signed-in person', async () => {
    open('/kiosk/pair?c=ABCD2345');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });
  it('S21 methods are stubbed on the stub adapter', async () => {
    expect((await notImplemented('mock').kioskFeed()).ok).toBe(false);
  });
});

describe('kiosk pairing screen', () => {
  it('shows the code as XXXX-XXXX, a QR, the instruction and the expiry', async () => {
    open('/kiosk');
    await waitFor(() => expect(screen.getByLabelText('Pairing code')).toHaveTextContent(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/));
    expect(screen.getByText('Scan with a staff phone to activate this screen')).toBeInTheDocument();
    expect(screen.getByText(/Code expires in \d+:\d\d/)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Simulate approval' })).toBeInTheDocument();
  });

  it('puts the pair origin and code in the QR url', async () => {
    const { pairUrl } = await import('./PairingScreen');
    expect(pairUrl('ABCD2345')).toBe(`${location.origin}/#/kiosk/pair?c=ABCD2345`);
  });

  it('asks for a secure page when WebCrypto is missing', async () => {
    store.insecure = true;
    open('/kiosk');
    expect(await screen.findByRole('alert')).toHaveTextContent('The kiosk needs a secure page (https or localhost).');
  });

  it('signs in and shows the board once the pairing is approved', async () => {
    const signIn = vi.spyOn(api, 'kioskSignIn');
    open('/kiosk');
    fireEvent.click(await screen.findByRole('button', { name: 'Simulate approval' }));
    expect(await screen.findByRole('region', { name: 'Class and lab' })).toBeInTheDocument();
    expect(signIn).toHaveBeenCalledTimes(1);
    expect((store.rec as { device_id: string }).device_id).toBeTruthy();
  });

  it('gets a new code when the old one expires', async () => {
    const start = vi.spyOn(api, 'kioskPairStart');
    start.mockResolvedValueOnce({ ok: true, data: { pairing_id: 'p0', code: 'AAAA1111', expires_at: new Date(Date.now() + 500).toISOString() } });
    open('/kiosk');
    await waitFor(() => expect(screen.getByLabelText('Pairing code')).toHaveTextContent('AAAA-1111'));
    await waitFor(() => expect(start).toHaveBeenCalledTimes(2), { timeout: 3000 });
    await waitFor(() => expect(screen.getByLabelText('Pairing code')).not.toHaveTextContent('AAAA-1111'));
  });

  it('forgets the key and pairs again on invalid_device', async () => {
    paired();
    vi.spyOn(api, 'kioskSignIn').mockResolvedValueOnce({ ok: false, error: { code: 'invalid_device', message: 'x' } });
    open('/kiosk');
    expect(await screen.findByRole('heading', { name: 'Activate this screen' })).toBeInTheDocument();
    expect((store.rec as { device_id: unknown }).device_id).toBeNull();
  });
});

describe('kiosk board', () => {
  beforeEach(paired);

  it('?demo=class shows the class now with slots, deliverables and linked items', async () => {
    open('/kiosk?demo=class');
    const card = await screen.findByRole('article', { name: 'In class now' });
    expect(within(card).getByRole('heading', { name: /Tutorial 2/ })).toBeInTheDocument();
    const slots = within(card).getByRole('list', { name: 'Time slots' });
    expect(within(slots).getAllByRole('listitem').length).toBeGreaterThanOrEqual(1);
    expect(within(slots).getByText('Now')).toBeInTheDocument();
    expect(within(slots).getByText(/Groups 1, 2, 3/)).toBeInTheDocument();
    expect(within(card).getByText('Bring a sketch of your app idea')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: /Setup guide/ })).toBeInTheDocument();
    expect(within(card).getByText('Not available yet')).toBeInTheDocument();
    expect(screen.queryByRole('article', { name: 'Today in the lab' })).toBeNull();
    expect(screen.getByText('Cohort 25.2')).toBeInTheDocument();
  });

  it('?demo=lab shows the next class and the lab hours with chips and a clash', async () => {
    // Today at 14:20 (not a fixed date: the mock sessions are placed relative to the real today).
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(colomboAt(colomboDate(Date.now()), '14:20')) });
    open('/kiosk?demo=lab');
    const next = await screen.findByRole('article', { name: 'Next class' });
    expect(within(next).getByText(/Tutorial 2/)).toBeInTheDocument();
    const lab = screen.getByRole('article', { name: 'Today in the lab' });
    expect(within(lab).getAllByRole('listitem', { current: 'time' })).toHaveLength(1);
    expect(within(lab).getByText('14:00–15:00')).toBeInTheDocument();
    expect(within(lab).getAllByText(/^251P-0\d\d/).length).toBeGreaterThan(5);
    expect(within(lab).getAllByRole('img', { name: 'Possible Mac conflict' }).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByRole('article', { name: 'In class now' })).toBeNull();
  });

  it('lists content in tabs as tiles', async () => {
    open('/kiosk?demo=lab');
    const panel = await screen.findByRole('complementary', { name: 'Content' });
    expect(within(panel).getByRole('link', { name: /Tutorial 1/ })).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('tab', { name: /Resources/ }));
    expect(within(panel).getByRole('link', { name: /Lab Mac setup/ })).toHaveAttribute('href', expect.stringContaining('/kiosk/c/content-r1'));
    expect(within(panel).getByRole('link', { name: /Lab Mac setup/ })).toHaveAttribute('href', expect.stringContaining('demo=lab'));
  });

  it('says the lab is closed when there are no hours today', async () => {
    const feed = await (async () => {
      await api.kioskSignIn('d', async () => new Uint8Array(64));
      const r = await api.kioskFeed();
      if (!r.ok) throw new Error();
      return r.data;
    })();
    vi.spyOn(api, 'kioskFeed').mockResolvedValue({ ok: true, data: { ...feed, session_now: null, lab_hours_today: null, lab_today: [], closure_today: { kind: 'holiday', reason: 'Public holiday (fictional)' } } });
    open('/kiosk');
    expect(await screen.findByText(/Lab closed today · Public holiday \(fictional\)/)).toBeInTheDocument();
  });

  it('holds the wake lock inside lab hours only and sends no separate heartbeat (S21.F4)', async () => {
    const request = vi.fn().mockResolvedValue({ release: vi.fn().mockResolvedValue(undefined) });
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
    const beat = vi.spyOn(api, 'kioskHeartbeat');
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-14T10:00:00+05:30') });
    const { unmount } = open('/kiosk?demo=lab');
    await screen.findByRole('article', { name: 'Today in the lab' });
    await waitFor(() => expect(request).toHaveBeenCalledWith('screen'));
    expect(beat).not.toHaveBeenCalled();
    unmount();
    request.mockClear();
    vi.setSystemTime(new Date('2026-11-14T21:00:00+05:30'));
    // ?demo=lab pins the mock clock to 13:20; ?demo=class keeps real time (21:00 > 19:00 close).
    open('/kiosk?demo=class');
    await screen.findByRole('article', { name: 'In class now' });
    expect(request).not.toHaveBeenCalled();
    Reflect.deleteProperty(navigator, 'wakeLock');
  });
});

describe('kiosk manual refresh (S21.F4)', () => {
  beforeEach(paired);

  it('reloads the feed, then backs off: 30 s, then 1 min', async () => {
    const feed = vi.spyOn(api, 'kioskFeed');
    open('/kiosk?demo=lab');
    await screen.findByRole('article', { name: 'Today in the lab' });
    const before = feed.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(feed.mock.calls.length).toBe(before + 1));
    const waiting = await screen.findByRole('button', { name: /^Refresh in 0:(30|29)$/ });
    expect(waiting).toBeDisabled();
    fireEvent.click(waiting);
    expect(feed.mock.calls.length).toBe(before + 1);
  });
});

describe('kiosk viewer', () => {
  beforeEach(paired);

  it('shows the sandboxed content with a big Back button that keeps ?demo=', async () => {
    open('/kiosk/c/content-t1?demo=class');
    expect(await screen.findByRole('heading', { name: 'Tutorial 1 — Demo game' })).toBeInTheDocument();
    const frame = await screen.findByTitle('Tutorial 1 — Demo game');
    expect(frame.getAttribute('sandbox')).toContain('allow-scripts');
    expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin');
    const back = screen.getByRole('link', { name: /Back/ });
    expect(back).toHaveAttribute('href', expect.stringContaining('/kiosk?demo=class'));
    fireEvent.click(back);
    expect(await screen.findByRole('article', { name: 'In class now' })).toBeInTheDocument();
  });

  it('Fill screen hides the top bar and leaves a Back notch that returns to the board (S21.F5)', async () => {
    open('/kiosk/c/content-t1?demo=class');
    fireEvent.click(await screen.findByRole('button', { name: /Fill screen/ }));
    expect(screen.queryByRole('heading', { name: 'Tutorial 1 — Demo game' })).not.toBeInTheDocument();
    expect(screen.getByTitle('Tutorial 1 — Demo game')).toBeInTheDocument();
    const notch = screen.getByRole('navigation', { name: 'Back' });
    const back = within(notch).getByRole('link', { name: /Back/ });
    expect(within(notch).getAllByRole('link')).toHaveLength(1);
    fireEvent.click(back);
    expect(await screen.findByRole('article', { name: 'In class now' })).toBeInTheDocument();
  });

  it('says so when an item is not available', async () => {
    open('/kiosk/c/content-m1');
    expect(await screen.findByText('This item is not available yet.')).toBeInTheDocument();
  });
});
