import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from '../routes';
import { api } from '../api';
import { resetMockAuth } from '../api/mock/auth';
import { MOCK_COHORT } from '../api/mock/fixtures/s1';
import { resetMockLab } from '../api/mock/lab';
import { resetMockSessions, setSessionRows } from '../api/mock/sessionStore';

const NOW = new Date('2026-11-09T10:00:00+05:30');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  resetMockAuth();
  resetMockLab();
  setSessionRows([]);
});
afterEach(() => {
  vi.useRealTimers();
  resetMockSessions();
});

async function bookingId(): Promise<string> {
  await api.verifyEmailCode('student001@example.edu', '123456');
  const lab = await api.getMyLab(MOCK_COHORT.id);
  if (!lab.ok) throw new Error('lab');
  return lab.data.bookings[0]!.id;
}

describe('lab ?b= deep link', () => {
  it('opens the withdraw confirm for that booking', async () => {
    const id = await bookingId();
    render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [`/lab?b=${id}`] })} />);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Withdraw this booking?')).toBeInTheDocument();
    expect(document.getElementById(`booking-${id}`)).toHaveClass('lab-booking-target');
  });

  it('ignores an unknown booking id', async () => {
    await bookingId();
    render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/lab?b=00000000-0000-4000-8000-000000000000'] })} />);
    await screen.findByRole('list', { name: 'My bookings' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
