import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    expect(screen.getByText(/Students get reminders and updates automatically/)).toBeInTheDocument();
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

describe('admin notifications: types, message, recent (S19)', () => {
  it('toggles a type', async () => {
    open();
    const sw = await screen.findByRole('switch', { name: /Lab closed/ });
    expect(sw).toBeChecked();
    fireEvent.click(sw);
    await waitFor(async () => {
      const r = await api.adminPushStats();
      expect(r.ok && r.data.kinds.find((k) => k.kind === 'lab_closed')?.enabled).toBe(false);
    });
    expect(screen.getByRole('switch', { name: /Lab closed/ })).not.toBeChecked();
    expect(screen.getByText(/when no-show tracking exists/)).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: /Test/ })).toBeNull();
  });

  it('shows the live audience line and sends after confirming', async () => {
    open();
    const form = await screen.findByRole('form', { name: 'Send a message' });
    const status = within(form).getByRole('status', { name: 'Audience' });
    await waitFor(() => expect(status).toHaveTextContent(/^\d+ students · 0 with notifications on$/));
    const total = /(\d+) students/.exec(status.textContent ?? '')![1];
    fireEvent.click(within(form).getByLabelText('Groups'));
    expect(status).toHaveTextContent('Pick at least one group.');
    fireEvent.click(within(form).getByLabelText('All students'));
    fireEvent.change(within(form).getByLabelText('Title'), { target: { value: 'Bring a laptop' } });
    fireEvent.change(within(form).getByLabelText('Message'), { target: { value: 'Tomorrow, room 2.' } });
    fireEvent.change(within(form).getByLabelText('Link'), { target: { value: '/#/lab' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Send message' }));
    const dlg = await screen.findByRole('dialog');
    expect(within(dlg).getByRole('heading', { name: `Send to ${total} students?` })).toBeInTheDocument();
    fireEvent.click(within(dlg).getByRole('button', { name: 'Send' }));
    expect(await screen.findByText(new RegExp(`^Sent to ${total} students`))).toBeInTheDocument();
    const recent = await screen.findByRole('table', { name: 'Recent notification batches' });
    expect(await within(recent).findByText('Bring a laptop')).toBeInTheDocument();
  });

  it('validates the message before asking', async () => {
    open();
    const form = await screen.findByRole('form', { name: 'Send a message' });
    fireEvent.click(within(form).getByRole('button', { name: 'Send message' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('Add a title.');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows an empty Recent table first', async () => {
    open();
    expect(await screen.findByText('Nothing sent yet.')).toBeInTheDocument();
  });
});

