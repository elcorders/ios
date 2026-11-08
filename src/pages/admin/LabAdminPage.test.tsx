import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from '../../routes';
import { api } from '../../api';
import { resetMockAuth } from '../../api/mock/auth';
import { resetMockAdmin } from '../../api/mock/admin';
import { addDaysIso, colomboToday, parseClosureLines } from './lab/labHelpers';

async function open(path: string) {
  await api.verifyEmailCode('admin@example.edu', '123456');
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
}

beforeEach(() => {
  resetMockAuth();
  resetMockAdmin();
  localStorage.clear();
});

describe('parseClosureLines', () => {
  it('parses dates with optional reasons and reports invalid lines', () => {
    const p = parseClosureLines('2027-01-05\n2027-01-06, Poya day\nnope\n2027-02-30\n\n2027-01-05, again', 'holiday');
    expect(p.rows).toEqual([
      { date: '2027-01-05', kind: 'holiday', reason: 'again' },
      { date: '2027-01-06', kind: 'holiday', reason: 'Poya day' },
    ]);
    expect(p.invalid.map((i) => i.line)).toEqual([3, 4]);
  });
});

describe('Admin > Lab', () => {
  it('redirects to Macs, edits a Mac and toggles service', async () => {
    await open('/admin/lab');
    const table = await screen.findByRole('table', { name: 'Lab Macs' });
    expect(within(table).getByText('Mac 13')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Take Mac 1 out of service' }));
    expect(await screen.findByRole('button', { name: 'Return Mac 1 to service' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add Mac' }));
    fireEvent.change(screen.getByLabelText('Number'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('That Mac number is already used.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Number'), { target: { value: '14' } });
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Spare' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Mac 14')).toBeInTheDocument();
  });

  it('saves hours and validates open < close', async () => {
    await open('/admin/lab/hours');
    const close = await screen.findByLabelText('Monday close');
    expect(close).toHaveValue('19');
    expect(screen.getByLabelText('Sunday closed')).toBeChecked();
    fireEvent.change(screen.getByLabelText('Monday open'), { target: { value: '20' } });
    expect(screen.getByText('Opening must be before closing.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save hours' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Monday open'), { target: { value: '8' } });
    fireEvent.click(screen.getByLabelText('Sunday closed'));
    fireEvent.click(screen.getByRole('button', { name: 'Save hours' }));
    expect(await screen.findByText('Hours saved.')).toBeInTheDocument();
    const res = await api.getLabHours();
    if (!res.ok) throw new Error('hours');
    expect(res.data.find((h) => h.weekday === 1)?.open_time.slice(0, 5)).toBe('08:00');
    expect(res.data.some((h) => h.weekday === 7)).toBe(true);
  });

  it('pastes closures with a preview, then deletes one', async () => {
    await open('/admin/lab/closures');
    const table = await screen.findByRole('table', { name: 'Upcoming closures' });
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    const d = addDaysIso(colomboToday(), 40);
    fireEvent.change(screen.getByLabelText('Dates'), { target: { value: `${d}, Exam week\nbad line` } });
    const preview = screen.getByRole('group', { name: 'Preview' });
    expect(within(preview).getByText('1 valid, 1 invalid.')).toBeInTheDocument();
    expect(within(preview).getByText(/Line 2 is not valid/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Add 1 closures/ }));
    expect(await screen.findByText('Added 1, updated 0.')).toBeInTheDocument();
    expect(await within(await screen.findByRole('table', { name: 'Upcoming closures' })).findByText(d)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: `Delete closure ${d}` }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Closure deleted.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(d)).toBeNull());
  });

  it('adds a single closure and toggles past closures', async () => {
    await open('/admin/lab/closures');
    await screen.findByRole('table', { name: 'Upcoming closures' });
    const d = addDaysIso(colomboToday(), 60);
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: d } });
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'holiday' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add closure' }));
    expect(await screen.findByText('Added 1, updated 0.')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Show past closures'));
    expect(await screen.findByRole('table', { name: 'Past closures' })).toBeInTheDocument();
    expect(screen.getByText('No past closures.')).toBeInTheDocument();
  });

  it('lists bookings grouped by slot with count / capacity', async () => {
    await open('/admin/lab/bookings');
    const d = addDaysIso(colomboToday(), 1);
    // nearest open day with bookings is found via the API, as the seed skips closed days
    let day = d;
    for (let i = 0; i < 8; i++) {
      const r = await api.adminListLabBookings(day, day);
      if (r.ok && r.data.length) break;
      day = addDaysIso(day, 1);
    }
    fireEvent.change(await screen.findByLabelText('Date'), { target: { value: day } });
    const slot = await screen.findByRole('region', { name: 'Slot 10:00' });
    expect(within(slot).getByText('12 / 12')).toBeInTheDocument();
    expect(within(slot).getAllByRole('row')).toHaveLength(13);
  });

  it('adjusts credits, filters, and clears nothing when not suspended', async () => {
    await open('/admin/lab/credits');
    const table = await screen.findByRole('table', { name: /Lab credits/ });
    const rows = within(table).getAllByRole('row');
    expect(rows.length).toBeGreaterThan(1);
    expect(screen.getByRole('button', { name: 'Suspended 0' })).toBeInTheDocument();
    const first = within(rows[1]!).getAllByRole('button', { name: /^Adjust credits/ })[0]!;
    const before = within(rows[1]!).getByText(/left/).textContent;
    fireEvent.click(first);
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(await screen.findByText(/not 0/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(await screen.findByText('A reason is required.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Makeup' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(await screen.findByText(/credits left\./)).toBeInTheDocument();
    await waitFor(() => expect(within(within(screen.getByRole('table', { name: /Lab credits/ })).getAllByRole('row')[1]!).getByText(/left/).textContent).not.toBe(before));

    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'zzzz' } });
    expect(screen.getByText('No matching students.')).toBeInTheDocument();
  });
});
