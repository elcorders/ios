import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from '../../routes';
import { api } from '../../api';
import { resetMockAuth } from '../../api/mock/auth';
import { resetMockKiosk } from '../../api/mock/kiosk';

const open = (path: string) => render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
const signIn = (email: string) => api.verifyEmailCode(email, '123456');

afterEach(() => vi.restoreAllMocks());
beforeEach(() => {
  resetMockAuth();
  resetMockKiosk();
});

describe('staff kiosk pairing page', () => {
  it('an instructor confirms the code, names the screen and activates it', async () => {
    await signIn('instructor001@example.edu');
    open('/kiosk/pair?c=abcd-2345');
    expect(await screen.findByText(/Code matches the screen\?/)).toBeInTheDocument();
    expect(screen.getByText('ABCD-2345')).toBeInTheDocument();
    expect(screen.queryByLabelText('Class')).toBeNull(); // cohort override is admin only
    const name = screen.getByLabelText('Device name');
    expect(name).toHaveAttribute('maxlength', '60');
    fireEvent.change(name, { target: { value: 'Lab 2 front TV' } });
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }));
    expect(await screen.findByText('Lab 2 front TV is active')).toBeInTheDocument();
  });

  it('an admin can pick a class, default "Current cohort"', async () => {
    await signIn('admin@example.edu');
    open('/kiosk/pair?c=ABCD2345');
    const select = await screen.findByLabelText('Class');
    expect(select).toHaveDisplayValue('Current cohort');
  });

  it('lets staff type the code when the link has none', async () => {
    await signIn('admin@example.edu');
    open('/kiosk/pair');
    fireEvent.change(await screen.findByLabelText('Code on the screen'), { target: { value: 'abcd 2345' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check code' }));
    expect(await screen.findByText('ABCD-2345')).toBeInTheDocument();
  });

  it('says an expired or used code needs a refreshed screen', async () => {
    await signIn('instructor001@example.edu');
    open('/kiosk/pair?c=00000000');
    expect(await screen.findByRole('alert')).toHaveTextContent('This code has expired or was already used. Refresh the kiosk screen.');
  });

  it('shows invalid_code again if the code dies before Activate', async () => {
    await signIn('instructor001@example.edu');
    open('/kiosk/pair?c=ABCD2345');
    fireEvent.change(await screen.findByLabelText('Device name'), { target: { value: 'Screen' } });
    vi.spyOn(api, 'kioskPairApprove').mockResolvedValueOnce({ ok: false, error: { code: 'invalid_code', message: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Refresh the kiosk screen.');
  });

  it('students are told only staff can activate a kiosk', async () => {
    await signIn('student005@example.edu');
    open('/kiosk/pair?c=ABCD2345');
    expect(await screen.findByText('Only staff can activate a kiosk.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Device name')).toBeNull();
  });
});
