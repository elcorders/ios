import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from '../../routes';
import { api } from '../../api';
import { resetMockAuth } from '../../api/mock/auth';
import { resetMockAdmin } from '../../api/mock/admin';
import { resetMockSessions, setSessionRows } from '../../api/mock/sessionStore';
import { MOCK_COHORT } from '../../api/mock/fixtures/s1';
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

describe('Admin > Lab switch', () => {
  it('toggles lab booking for the cohort', async () => {
    await open('/admin/lab');
    const sw = await screen.findByRole('switch', { name: /Lab booking for .*: Open/ });
    expect(sw).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(sw);
    const closed = await screen.findByRole('switch', { name: /Lab booking for .*: Closed/ });
    expect(closed).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(closed);
    expect(await screen.findByRole('switch', { name: /: Open/ })).toBeInTheDocument();
  });
});

describe('Admin > Lab', () => {
  it('redirects to Macs, edits a Mac and toggles service', async () => {
    await open('/admin/lab');
    expect(await screen.findByRole('heading', { name: 'Calendar' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Macs' }));
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
    const table = await screen.findByRole('table', { name: 'Upcoming class days' });
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(within(await screen.findByRole('table', { name: 'Upcoming public holidays' })).getAllByRole('row')).toHaveLength(2);
    expect(within(await screen.findByRole('table', { name: 'Upcoming lab closures' })).getByText('No upcoming lab closures.')).toBeInTheDocument();
    const d = addDaysIso(colomboToday(), 40);
    fireEvent.change(screen.getByLabelText('Dates (lab closures)'), { target: { value: `${d}, Exam week\nbad line` } });
    const preview = screen.getByRole('group', { name: 'Preview lab closures' });
    expect(within(preview).getByText('1 valid, 1 invalid.')).toBeInTheDocument();
    expect(within(preview).getByText(/Line 2 is not valid/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Add 1 lab closures/ }));
    expect(await screen.findByText('Added 1, updated 0.')).toBeInTheDocument();
    expect(await within(await screen.findByRole('table', { name: 'Upcoming lab closures' })).findByText(d)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: `Delete lab closure ${d}` }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Closure deleted.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(d)).toBeNull());
  });

  it('adds a single closure and toggles past closures', async () => {
    await open('/admin/lab/closures');
    await screen.findByRole('table', { name: 'Upcoming public holidays' });
    const d = addDaysIso(colomboToday(), 60);
    fireEvent.change(screen.getByLabelText('From (public holiday)'), { target: { value: d } });
    fireEvent.click(screen.getByRole('button', { name: 'Add public holiday' }));
    expect(await screen.findByText('Added 1, updated 0.')).toBeInTheDocument();
    expect(within(await screen.findByRole('table', { name: 'Upcoming public holidays' })).getByText(d)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Show past closures'));
    expect(await screen.findByRole('table', { name: 'Past public holidays' })).toBeInTheDocument();
    expect(screen.getByText('No past public holidays.')).toBeInTheDocument();
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

describe('Admin > Lab > Calendar', () => {
  afterEach(() => resetMockSessions());

  it('renders the month grid with booked / capacity, levels and a class block, then shows the day detail', async () => {
    const t = colomboToday();
    const day = addDaysIso(t, 1);
    setSessionRows([{
      id: 's-cal', cohort_id: MOCK_COHORT.id, date: t, start_time: '09:00', end_time: '12:00', title: 'Fictional class',
      group_nos: [1], deliverables: [], lab_block_until: '16:00', content_ids: [], created_at: '2026-11-01T09:00:00+05:30',
    }]);
    await open('/admin/lab/calendar');
    const grid = await screen.findByRole('list', { name: /^Lab calendar / });
    expect(within(grid).getAllByRole('button').length).toBeGreaterThanOrEqual(28);
    const todayBtn = within(grid).getByRole('button', { name: /today/ });
    expect(todayBtn).toHaveAttribute('aria-current', 'date');
    expect(within(todayBtn).getAllByText('Class until 16:00').length).toBeGreaterThan(0);
    // pick a day and read the hour rows
    const dayBtn = within(grid).getAllByRole('button').find((b) => b.getAttribute('aria-label')?.startsWith(
      new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Colombo', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${day}T12:00:00+05:30`)).replace(/,/g, ''),
    ));
    expect(dayBtn).toBeTruthy();
    fireEvent.click(dayBtn!);
    expect(await screen.findByRole('link', { name: 'Open this day in Bookings' })).toHaveAttribute('href', `/admin/lab/bookings?date=${day}`);
  });

  it('navigates months and lists hours with level and blocked rows', async () => {
    const t = colomboToday();
    setSessionRows([{
      id: 's-cal2', cohort_id: MOCK_COHORT.id, date: t, start_time: '09:00', end_time: '12:00', title: 'Fictional class',
      group_nos: [1], deliverables: [], lab_block_until: '24:00', content_ids: [], created_at: '2026-11-01T09:00:00+05:30',
    }]);
    await open('/admin/lab/calendar');
    const grid = await screen.findByRole('list', { name: /^Lab calendar / });
    fireEvent.click(within(grid).getByRole('button', { name: /today/ }));
    expect(within(await screen.findByRole('region', { name: /^Details for / })).getAllByText(/Class \(whole day\)/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(await screen.findByRole('button', { name: 'This month' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /^Details for / })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'This month' }));
    expect(await screen.findByRole('list', { name: /^Lab calendar / })).toBeInTheDocument();
  });
});

describe('Admin > Lab > Closures ranges', () => {
  it('adds a range, shows it as part of a range and deletes the whole range', async () => {
    await open('/admin/lab/closures');
    await screen.findByRole('table', { name: 'Upcoming lab closures' });
    const from = addDaysIso(colomboToday(), 40);
    const to = addDaysIso(from, 2);
    fireEvent.change(screen.getByLabelText('From (lab closure)'), { target: { value: from } });
    fireEvent.change(screen.getByLabelText('To (lab closure, optional)'), { target: { value: to } });
    fireEvent.change(screen.getByLabelText('Reason (lab closure)'), { target: { value: 'Fictional break' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add lab closure' }));
    expect(await screen.findByText('Added 3, updated 0.')).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: 'Upcoming lab closures' });
    expect(within(table).getAllByText(/part of range/)).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: `Delete range of lab closure ${from}` }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Delete range' })).getByRole('button', { name: 'Delete range' }));
    expect(await screen.findByText('Range deleted (3 days).')).toBeInTheDocument();
    expect(within(await screen.findByRole('table', { name: 'Upcoming lab closures' })).getByText('No upcoming lab closures.')).toBeInTheDocument();
  });

  it('rejects To before From and keeps single-day add working', async () => {
    await open('/admin/lab/closures');
    await screen.findByRole('table', { name: 'Upcoming lab closures' });
    const from = addDaysIso(colomboToday(), 40);
    fireEvent.change(screen.getByLabelText('From (lab closure)'), { target: { value: from } });
    fireEvent.change(screen.getByLabelText('To (lab closure, optional)'), { target: { value: addDaysIso(from, -1) } });
    fireEvent.click(screen.getByRole('button', { name: 'Add lab closure' }));
    expect(await screen.findByText('To must be on or after From.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('To (lab closure, optional)'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add lab closure' }));
    expect(await screen.findByText('Added 1, updated 0.')).toBeInTheDocument();
    expect(screen.queryByText(/part of range/)).toBeNull();
  });
});
