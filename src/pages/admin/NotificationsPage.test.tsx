import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from '../../routes';
import { api } from '../../api';
import { resetMockAuth } from '../../api/mock/auth';
import { resetMockPush } from '../../api/mock/push';

function open() {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/admin/notifications'] })} />);
}

beforeEach(async () => {
  vi.stubEnv('VITE_FEATURE_PUSH', 'on');
  resetMockAuth();
  resetMockPush();
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  await api.verifyEmailCode('admin@example.edu', '123456');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('admin notifications', () => {
  it('shows stats and the automatic-send note', async () => {
    open();
    expect(await screen.findByText(/Devices: 0/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing is sent to students automatically/)).toBeInTheDocument();
    expect(screen.getByText(/Students with push: 0 of/)).toBeInTheDocument();
  });

  it('asks to enable push when the admin has no device', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Send test to me' }));
    expect(await screen.findByText('Turn on notifications on this device first.')).toBeInTheDocument();
  });

  it('sends a test to the admin devices', async () => {
    await api.savePushSubscription({ endpoint: 'https://push.example.test/a', p256dh: 'k', auth: 'a', user_agent: null });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Send test to me' }));
    expect(await screen.findByText('Sent to 1 device(s).')).toBeInTheDocument();
  });

  it('is hidden when the push flag is off', async () => {
    vi.stubEnv('VITE_FEATURE_PUSH', 'off');
    open();
    expect(await screen.findByRole('link', { name: 'Members' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Notifications' })).toBeNull();
    expect(screen.queryByText(/Students with push/)).toBeNull();
  });
});
