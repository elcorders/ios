import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from '../routes';
import { api } from '../api';
import { resetMockAuth } from '../api/mock/auth';
import { _setDeferredPromptForTest, type BeforeInstallPromptEvent } from '../lib/pwa';
import { MOCK_COHORT } from '../api/mock/fixtures/s1';

function open() {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/'] })} />);
}

beforeEach(() => {
  resetMockAuth();
  localStorage.clear();
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  _setDeferredPromptForTest(null);
});

describe('Home lab card', () => {
  it('shows for a student while the lab is open', async () => {
    await api.verifyEmailCode('student005@example.edu', '123456');
    open();
    expect(await screen.findByRole('link', { name: /Lab booking/ })).toBeInTheDocument();
  });

  it('hides for a student while the lab is closed, but stays for an admin', async () => {
    await api.verifyEmailCode('admin@example.edu', '123456');
    await api.adminUpdateCohortSettings(MOCK_COHORT.id, { lab_open: false });
    await api.verifyEmailCode('student005@example.edu', '123456');
    open();
    await screen.findByRole('link', { name: /Guides and references/ });
    expect(screen.queryByRole('link', { name: /Lab booking/ })).toBeNull();
  });

  it('shows for an admin', async () => {
    await api.verifyEmailCode('admin@example.edu', '123456');
    open();
    expect(await screen.findByRole('link', { name: /Lab booking/ })).toBeInTheDocument();
  });
});

describe('Home app tile', () => {
  it('is first and offers install when the browser allows it', async () => {
    _setDeferredPromptForTest({ prompt: async () => {}, userChoice: Promise.resolve({ outcome: 'accepted' }) } as unknown as BeforeInstallPromptEvent);
    await api.verifyEmailCode('student005@example.edu', '123456');
    open();
    const tile = await screen.findByRole('region', { name: 'App' });
    expect(tile.querySelector('button')).toHaveTextContent('Install');
    expect(document.querySelector('section.stack-lg')!.firstElementChild).toBe(tile);
  });

  it('offers notifications when standalone and permission is default, with confetti after enabling', async () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U');
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('standalone') }));
    const N = { permission: 'default', requestPermission: vi.fn(async () => ((N.permission = 'granted'), 'granted')) };
    vi.stubGlobal('Notification', N);
    vi.stubGlobal('PushManager', class {});
    const sub = { endpoint: 'https://push.example.test/h', getKey: () => new Uint8Array([1, 2]).buffer, unsubscribe: vi.fn() };
    let cur: typeof sub | null = null;
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: Promise.resolve({ pushManager: { getSubscription: async () => cur, subscribe: async () => (cur = sub) } }) },
    });
    await api.verifyEmailCode('student005@example.edu', '123456');
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Turn on notifications' }));
    await waitFor(() => expect(document.querySelector('canvas')).not.toBeNull());
    expect(await screen.findByText('Notifications on')).toBeInTheDocument();
    Reflect.deleteProperty(navigator, 'serviceWorker');
  });

  it('celebrates the first standalone launch once', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('standalone') }));
    await api.verifyEmailCode('student005@example.edu', '123456');
    open();
    await screen.findByRole('heading', { name: 'Home' });
    expect(localStorage.getItem('ios-installed-celebrated')).toBe('1');
  });
});

describe('Home dashboard cards', () => {
  it('shows the next session and lab bookings for a student', async () => {
    await api.verifyEmailCode('student005@example.edu', '123456');
    open();
    const next = await screen.findByRole('region', { name: /Next session/ });
    expect(next).toHaveTextContent(/Tutorial 2|Progress review|No upcoming/);
    expect(await screen.findByRole('region', { name: /My lab bookings/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Book or manage' })).toHaveAttribute('href', '/lab');
    expect(screen.getByRole('link', { name: /Class materials/ })).toBeInTheDocument();
  });

  it('shows no student cards for an admin', async () => {
    await api.verifyEmailCode('admin@example.edu', '123456');
    open();
    await screen.findByRole('heading', { name: 'Home' });
    expect(screen.queryByRole('region', { name: /Next session/ })).toBeNull();
  });
});
