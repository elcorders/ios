import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from '../routes';
import { api } from '../api';
import { resetMockAuth } from '../api/mock/auth';
import { resetMockPush, MOCK_REMINDER_BOOKING_ID } from '../api/mock/push';
import { hashPathOf, relativeTime } from './Notifications';

function open(path = '/notifications') {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(async () => {
  vi.stubEnv('VITE_FEATURE_PUSH', 'on');
  resetMockAuth();
  resetMockPush();
  await api.verifyEmailCode('student005@example.edu', '123456');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('helpers', () => {
  it('formats relative time and links', () => {
    const now = Date.parse('2026-11-10T10:00:00Z');
    expect(relativeTime('2026-11-10T09:59:40Z', now)).toBe('just now');
    expect(relativeTime('2026-11-10T09:30:00Z', now)).toBe('30 min ago');
    expect(relativeTime('2026-11-10T07:00:00Z', now)).toBe('3 h ago');
    expect(relativeTime('2026-11-08T10:00:00Z', now)).toBe('2 d ago');
    expect(hashPathOf('/#/lab?b=1')).toBe('/lab?b=1');
    expect(hashPathOf(null)).toBe('/');
    expect(hashPathOf('https://example.com')).toBe('/');
  });
});

describe('student notifications page', () => {
  it('lists notifications with unread dots and does not mark read on open', async () => {
    open();
    const list = await screen.findByRole('list', { name: 'Notification list' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(4);
    expect(within(list).getAllByRole('img', { name: 'Unread' })).toHaveLength(2);
    expect(within(list).getByText(/Class tomorrow/)).toBeInTheDocument();
    const me = await api.getMyPush();
    expect(me.ok && me.data.unread).toBe(2);
  });

  it('marks all read', async () => {
    open();
    await screen.findByRole('list', { name: 'Notification list' });
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    await waitFor(() => expect(screen.queryAllByRole('img', { name: 'Unread' })).toHaveLength(0));
    const me = await api.getMyPush();
    expect(me.ok && me.data.unread).toBe(0);
    expect(screen.getByRole('button', { name: 'Mark all read' })).toBeDisabled();
  });

  it('marks one read and follows its link', async () => {
    const router = open();
    fireEvent.click(await screen.findByRole('button', { name: /Lab tomorrow 14:00–16:00/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/lab'));
    expect(router.state.location.search).toBe(`?b=${MOCK_REMINDER_BOOKING_ID}`);
    const me = await api.getMyPush();
    expect(me.ok && me.data.unread).toBe(1);
  });

  it('shows the empty state', async () => {
    await api.verifyEmailCode('student007@example.edu', '123456');
    open();
    expect(await screen.findByText('No notifications yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('loads more with the last created_at', async () => {
    const spy = vi.spyOn(api, 'listMyNotifications');
    const real = await api.listMyNotifications();
    if (!real.ok) throw new Error('x');
    spy.mockResolvedValueOnce({ ok: true, data: { items: real.data.items.slice(0, 2), has_more: true } });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(4));
    expect(spy).toHaveBeenLastCalledWith(real.data.items[1]!.created_at);
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
    spy.mockRestore();
  });

  it('redirects home when the push flag is off', async () => {
    vi.stubEnv('VITE_FEATURE_PUSH', 'off');
    const router = open();
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(screen.queryByRole('heading', { name: 'Notifications' })).toBeNull();
  });
});

describe('header bell', () => {
  it('shows the unread count in its label and refreshes on a service-worker push message', async () => {
    const listeners: ((e: MessageEvent) => void)[] = [];
    vi.stubGlobal('navigator', {
      ...navigator,
      serviceWorker: {
        addEventListener: (_: string, fn: (e: MessageEvent) => void) => listeners.push(fn),
        removeEventListener: () => undefined,
      },
    });
    open('/');
    expect(await screen.findByRole('link', { name: 'Notifications, 2 unread' })).toBeInTheDocument();
    await api.markNotificationsRead(null);
    await act(async () => {
      listeners.forEach((fn) => fn({ data: { type: 'push' } } as MessageEvent));
    });
    expect(await screen.findByRole('link', { name: 'Notifications' })).toBeInTheDocument();
  });

  it('is hidden when the flag is off, and for non-admins when it is admin-only', async () => {
    vi.stubEnv('VITE_FEATURE_PUSH', 'off');
    open('/');
    await screen.findByRole('link', { name: 'Home' });
    expect(screen.queryByRole('link', { name: /^Notifications/ })).toBeNull();
  });

  it('admin-only flag hides it from students', async () => {
    vi.stubEnv('VITE_FEATURE_PUSH', 'admin');
    open('/');
    await screen.findByRole('link', { name: 'Home' });
    expect(screen.queryByRole('link', { name: /^Notifications/ })).toBeNull();
  });
});

describe('bell badge after mark all read', () => {
  it('drops the unread count without a route change', async () => {
    vi.stubEnv('VITE_FEATURE_PUSH', 'on');
    await api.verifyEmailCode('student005@example.edu', '123456');
    render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/notifications'] })} />);
    expect(await screen.findByRole('link', { name: /Notifications, 2 unread/ })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Mark all read' }));
    expect(await screen.findByRole('link', { name: 'Notifications' })).toBeInTheDocument();
  });
});
