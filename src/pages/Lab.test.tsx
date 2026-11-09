import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from '../routes';
import { api } from '../api';
import { resetMockAuth } from '../api/mock/auth';
import { mockSetBookingStatus } from '../api/mock/lab';
import { MOCK_COHORT } from '../api/mock/fixtures/s1';

// Monday 2026-11-09 10:00 Colombo. Mock lab: Tue 10th has a full 10:00 slot; Thu 12th is a class day.
const NOW = new Date('2026-11-09T10:00:00+05:30');
const C = MOCK_COHORT.id;
const slot = (date: string, hour: number) => `${date}T${String(hour).padStart(2, '0')}:00:00+05:30`;

function open() {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/lab'] })} />);
}
const signIn = (n: number) => api.verifyEmailCode(`student${String(n).padStart(3, '0')}@example.edu`, '123456');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  resetMockAuth();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('lab page: not eligible', () => {
  it('explains has_mac and still lists and withdraws an earlier booking', async () => {
    await signIn(1);
    open();
    expect(await screen.findByText(/do not have a Mac of their own/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Pick your times' })).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: /^Withdraw booking/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Withdraw' }));
    expect(await screen.findByText('No bookings in this credit period.')).toBeInTheDocument();
  });

  it.each([
    ['no_survey', /Answer the quick Mac question/],
    ['suspended', /paused after missed sessions/],
  ] as const)('shows the %s reason', async (reason, text) => {
    await signIn(5);
    const real = await api.getMyLab(C);
    if (!real.ok) throw new Error();
    vi.spyOn(api, 'getMyLab').mockResolvedValue({ ok: true, data: { ...real.data, eligible: false, reason } });
    open();
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Book/ })).toBeNull();
  });
});

describe('lab page: eligible student', () => {
  beforeEach(async () => {
    await signIn(5);
  });

  it('shows credits, week hours and cycle dates', async () => {
    open();
    expect(await screen.findByText('20 of 20')).toBeInTheDocument();
    expect(screen.getByText('0 of 10 hours')).toBeInTheDocument();
    expect(screen.getByText(/7 Nov to 20 Nov/)).toBeInTheDocument();
  });

  it('marks full and closed days and lets the student pick only open slots', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: /Tue 10 Nov/ }));
    const full = screen.getByRole('checkbox', { name: /10:00 to 11:00/ });
    expect(full).toBeDisabled();
    expect(screen.getByText('Full')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /14:00 to 15:00/ })).toHaveAccessibleName(/7 seats left/);
    fireEvent.click(screen.getByRole('button', { name: /Thu 12 Nov/ }));
    expect(screen.getByText(/closed on Thu 12 Nov: Class day \(fictional\)/)).toBeInTheDocument();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('books a slot, asks for a preferred Mac, and lists the booking', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: /Tue 10 Nov/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /15:00 to 16:00/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Book 1 slot' }));
    const confirm = await screen.findByRole('dialog', { name: /Book 1 slot/ });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Confirm booking' }));
    expect(await screen.findByText('Booked 1 slot')).toBeInTheDocument();
    const prompt = await screen.findByRole('dialog', { name: 'Preferred Mac' });
    fireEvent.change(within(prompt).getByLabelText('Preferred Mac'), {
      target: { value: (within(prompt).getByRole('option', { name: 'Mac 3' }) as HTMLOptionElement).value },
    });
    fireEvent.click(within(prompt).getByRole('button', { name: 'Save' }));
    const list = await screen.findByRole('list', { name: 'My bookings' });
    expect(within(list).getByText(/Tue 10 Nov 15:00/)).toBeInTheDocument();
    expect(screen.getByText('19 of 20')).toBeInTheDocument();
    expect(screen.getByText('Mac 3')).toBeInTheDocument();
  });

  it('lets the student skip the preferred Mac with No preference', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: /Tue 10 Nov/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /15:00 to 16:00/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Book 1 slot' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Confirm booking' }));
    const prompt = await screen.findByRole('dialog', { name: 'Preferred Mac' });
    fireEvent.click(within(prompt).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('No preference')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows a friendly message for an error code', async () => {
    vi.spyOn(api, 'bookSlots').mockResolvedValue({
      ok: false,
      error: { code: 'slot_full', message: 'x', details: { slot_start: slot('2026-11-10', 15) } },
    });
    open();
    fireEvent.click(await screen.findByRole('button', { name: /Tue 10 Nov/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /15:00 to 16:00/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Book 1 slot' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Confirm booking' }));
    expect(await screen.findByText(/That slot just filled up/)).toBeInTheDocument();
    expect(screen.getByText(/Tue 10 Nov 15:00/, { selector: '[role="alert"]' })).toBeInTheDocument();
  });

  it('stops at 13 selected slots', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: /Wed 11 Nov/ }));
    for (const h of [9, 10, 11, 12, 13, 14, 15, 16, 17, 18]) {
      fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(`${String(h).padStart(2, '0')}:00 to`) }));
    }
    fireEvent.click(screen.getByRole('button', { name: /Fri 13 Nov/ }));
    for (const h of [9, 10, 11]) {
      fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(`${String(h).padStart(2, '0')}:00 to`) }));
    }
    expect(screen.getByText('13 selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Tue 17 Nov/ }));
    for (const box of screen.getAllByRole('checkbox')) expect(box).toBeDisabled();
  });

  it('shows the credit penalty after missed bookings', async () => {
    const r = await api.bookSlots(C, [slot('2026-11-10', 15), slot('2026-11-10', 16)]);
    if (!r.ok) throw new Error(r.error.code);
    r.data.bookings.forEach((b) => mockSetBookingStatus(b.id, 'no_show'));
    open();
    expect(await screen.findByText(/−4 credits for 2 missed bookings\. Attend your next booking to get them back\./)).toBeInTheDocument();
  });

  it('withdraws a future booking after confirming', async () => {
    await api.bookSlots(C, [slot('2026-11-10', 15)]);
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Withdraw booking Tue 10 Nov 15:00' }));
    const dialog = await screen.findByRole('dialog', { name: 'Withdraw this booking?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Withdraw' }));
    expect(await screen.findByText('No bookings in this credit period.')).toBeInTheDocument();
    expect(screen.getByText('20 of 20')).toBeInTheDocument();
  });

  it('shows an overlap warning with suggestions and books a suggestion', async () => {
    const lab = await api.getMyLab(C);
    if (!lab.ok) throw new Error();
    await api.setPreferredMac(C, lab.data.macs.find((m) => m.no === 3)!.id);
    open();
    fireEvent.click(await screen.findByRole('button', { name: /Tue 10 Nov/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /11:00 to 12:00/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Book 1 slot' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Confirm booking' }));
    expect(await screen.findByText(/prefers the same Mac/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /Also book Tue 10 Nov 09:00/ }));
    const list = await screen.findByRole('list', { name: 'My bookings' });
    expect(await within(list).findByText(/Tue 10 Nov 09:00/)).toBeInTheDocument();
  });
});
