import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from '../../routes';
import { api } from '../../api';
import { notImplemented } from '../../api/stub';
import { resetMockAuth } from '../../api/mock/auth';
import { resetMockKiosk } from '../../api/mock/kiosk';
import { resetMockKioskRemote } from '../../api/mock/kioskRemote';
import type { KioskRecord } from '../../lib/kioskKey';
import type { KioskRemoteState } from '../../api/types';

const store = vi.hoisted(() => ({ rec: null as null | Record<string, unknown> }));
vi.mock('../../lib/kioskKey', async (orig) => {
  const real = await orig<typeof import('../../lib/kioskKey')>();
  return {
    ...real,
    kioskCryptoAvailable: () => true,
    getOrCreateRecord: async () => store.rec as unknown as KioskRecord,
    updateRecord: async (patch: object) => (store.rec = { ...store.rec, ...patch }) as unknown as KioskRecord,
    forget: async () => undefined,
    sign: async () => new Uint8Array(64),
  };
});

const LAB1 = '00000000-0000-4000-8000-000000002101';
const KIOSK_DEVICE = '00000000-0000-4000-8000-000000002111';
const mount = (path: string) => render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);

beforeEach(async () => {
  resetMockAuth();
  resetMockKiosk();
  resetMockKioskRemote();
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo; // jsdom has no scrolling
  store.rec = { device_id: KIOSK_DEVICE, pairing_id: null, keys: {}, public_jwk: { kty: 'EC', crv: 'P-256', x: 'x', y: 'y' } };
  await api.verifyEmailCode('admin@example.edu', '123456');
});
afterEach(() => vi.restoreAllMocks());

describe('S23 remote page', () => {
  it('is admin only', async () => {
    resetMockAuth();
    await api.verifyEmailCode('instructor001@example.edu', '123456');
    mount(`/admin/kiosks/${LAB1}/remote`);
    expect(await screen.findByText('Only admins can control a kiosk.')).toBeInTheDocument();
  });

  it('S23 methods are stubbed on the stub adapter', async () => {
    expect((await notImplemented('stub').kioskControlStart(LAB1, false)).ok).toBe(false);
  });

  it('takes control, waits for the screen, and releases', async () => {
    mount(`/admin/kiosks/${LAB1}/remote`);
    expect(await screen.findByRole('heading', { name: 'Remote: Lab 1 wall screen' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Take control' }));
    expect(await screen.findByRole('toolbar', { name: 'Screen controls' })).toBeInTheDocument();
    expect(screen.getByText('Waiting for the screen to answer… Is it on and online?')).toBeInTheDocument();
    expect((await api.kioskControlState(LAB1)).ok && (await api.kioskControlState(LAB1))).toMatchObject({ data: { lease: { controller_name: 'Test A.' } } });
    fireEvent.click(screen.getByRole('button', { name: 'Release' }));
    expect(await screen.findByText('You released the screen.')).toBeInTheDocument();
    await waitFor(async () => expect((await api.kioskControlState(LAB1)).ok && (await api.kioskControlState(LAB1))).toMatchObject({ data: { lease: null } }));
  });

  it('asks before taking over, and the old lease ends as taken over', async () => {
    const first = await api.kioskControlStart(LAB1, false);
    expect(first.ok).toBe(true);
    mount(`/admin/kiosks/${LAB1}/remote`);
    await screen.findByRole('heading', { name: 'Remote: Lab 1 wall screen' });
    fireEvent.click(screen.getByRole('button', { name: 'Take control' }));
    const dlg = await screen.findByRole('dialog', { name: 'Take over this screen?' });
    expect(within(dlg).getByText(/already controlling this screen in another tab/)).toBeInTheDocument();
    fireEvent.click(within(dlg).getByRole('button', { name: 'Take over' }));
    expect(await screen.findByRole('toolbar', { name: 'Screen controls' })).toBeInTheDocument();
    const hb = first.ok ? await api.kioskControlHeartbeat(first.data.id) : null;
    expect(hb).toMatchObject({ ok: false, error: { code: 'lease_ended', details: { end_reason: 'taken_over', taken_over_by_name: 'Test A.' } } });
  });
});

describe('S23 remote → kiosk (mock channel)', () => {
  it('the kiosk obeys the controller: badge, open an item, blank, zoom; ignores a stale lease; release clears it', async () => {
    // The kiosk (its own tree) and the remote page in one document, talking over the mock BroadcastChannel.
    const kiosk = mount('/kiosk?demo=class');
    expect(await screen.findByRole('region', { name: 'Class and lab' })).toBeInTheDocument();
    mount(`/admin/kiosks/${LAB1}/remote`);
    await screen.findByRole('heading', { name: 'Remote: Lab 1 wall screen' });
    fireEvent.click(screen.getByRole('button', { name: 'Take control' }));

    expect(await screen.findByText('Controlled by Test A.', {}, { timeout: 5000 })).toBeInTheDocument();
    const menu = await screen.findByRole('complementary', { name: 'Open on the screen' }, { timeout: 5000 });
    const first = (await within(menu).findAllByRole('button'))[0]!;
    const title = first.querySelector('strong')!.textContent!;
    fireEvent.click(first);
    expect(await within(kiosk.container).findByRole('heading', { name: title }, { timeout: 5000 })).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('.remote-showing strong')).toHaveTextContent(title), { timeout: 5000 });
    expect(await screen.findByTitle(`Mirror of ${title}`)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Blank' }));
    expect(await within(kiosk.container).findByText('Screen paused')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Show screen' }));
    await waitFor(() => expect(within(kiosk.container).queryByText('Screen paused')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reset zoom' })).toHaveTextContent('125%'));
    expect(within(kiosk.container).getByTitle(title).parentElement).toHaveStyle({ width: '80%' }); // zoom 1.25 shrinks the box to 1/1.25

    // A command under someone else's (unknown) lease is ignored.
    const ch = await api.kioskRemoteChannel(LAB1, 'controller');
    if (!ch.ok) throw new Error('channel');
    const states: KioskRemoteState[] = [];
    ch.data.on('state', (s) => states.push(s as KioskRemoteState));
    act(() => ch.data.send('cmd', { v: 1, lease_id: '00000000-0000-4000-8000-00000000dead', seq: 1, cmd: { type: 'blank', on: true } }));
    await new Promise((r) => setTimeout(r, 300));
    expect(within(kiosk.container).queryByText('Screen paused')).toBeNull();
    ch.data.close();

    fireEvent.click(screen.getByRole('button', { name: 'Release' }));
    await waitFor(() => expect(within(kiosk.container).queryByText(/Controlled by/)).toBeNull(), { timeout: 5000 });
  }, 20_000);
});
