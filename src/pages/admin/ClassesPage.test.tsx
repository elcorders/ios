import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from '../../routes';
import { api } from '../../api';
import { resetMockAuth } from '../../api/mock/auth';
import { resetMockAdmin } from '../../api/mock/admin';
import { resetMockContent } from '../../api/mock/content';

function open(path = '/admin/classes') {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
}

beforeEach(async () => {
  resetMockAuth();
  resetMockAdmin();
  resetMockContent();
  localStorage.clear();
  await api.verifyEmailCode('admin@example.edu', '123456');
});

const dialog = () => screen.getByRole('dialog');

describe('admin classes tab', () => {
  it('lists upcoming and past sessions with groups, deliverables, lab block and links', async () => {
    open();
    await screen.findByRole('heading', { name: 'Classes — 25.2' });
    const upcoming = within(await screen.findByRole('region', { name: 'Upcoming classes' }));
    expect(upcoming.getAllByRole('listitem', { name: /Tutorial 2/ })).toHaveLength(1);
    expect(upcoming.getByText('09:00–12:00 · G1, G2, G3')).toBeInTheDocument();
    expect(upcoming.getByText('13:00–16:00 · G4, G5, G6')).toBeInTheDocument();
    expect(upcoming.getByText('Progress review (fictional)')).toBeInTheDocument();
    expect(upcoming.getByText("Doesn't block the lab")).toBeInTheDocument();
    expect(upcoming.getByText('Lab blocked all day')).toBeInTheDocument();
    expect(upcoming.getByText(/Week 2 slides — Layouts · material · on session/)).toBeInTheDocument();
    expect(upcoming.getAllByText('2 deliverables').length).toBeGreaterThan(0);
    const past = within(screen.getByRole('region', { name: 'Past classes' }));
    expect(past.getByText('Tutorial 1 — Demo game (fictional)')).toBeInTheDocument();
  });

  it('adds a session with groups, deliverables, lab block and links', async () => {
    open();
    await screen.findByText('Progress review (fictional)');
    fireEvent.click(screen.getByRole('button', { name: 'Add class' }));
    const d = within(dialog());
    fireEvent.change(d.getByLabelText('Title'), { target: { value: 'Lab clinic' } });
    fireEvent.change(d.getByLabelText('Date'), { target: { value: '2099-02-03' } });
    fireEvent.click(d.getByRole('button', { name: 'Save' }));
    expect(await d.findByRole('alert')).toHaveTextContent('Each slot needs at least one group.');
    fireEvent.click(within(d.getByRole('group', { name: 'Slot 1' })).getByLabelText('G2'));
    fireEvent.change(d.getByLabelText(/Deliverables/), { target: { value: 'Item A\n\nItem B' } });
    fireEvent.change(d.getByLabelText('Lab block'), { target: { value: 'time' } });
    fireEvent.change(d.getByLabelText('Lab blocked until'), { target: { value: '14:30' } });
    fireEvent.click(d.getByLabelText(/Tutorial 3 — Draft/));
    fireEvent.click(d.getByLabelText(/Setup guide/));
    fireEvent.click(d.getByRole('button', { name: 'Save' }));
    const item = await screen.findByRole('listitem', { name: 'Lab clinic' });
    expect(item).toHaveTextContent('09:00–12:00 · G2');
    expect(item).toHaveTextContent('2 deliverables');
    expect(item).toHaveTextContent('Lab blocked until 14:30');
    expect(item).toHaveTextContent(/Tutorial 3 — Draft · tutorial · on session/);
    expect(item).toHaveTextContent(/Setup guide · material · published/);
  });

  it('shows an error when the end is not after the start', async () => {
    open();
    await screen.findByText('Progress review (fictional)');
    fireEvent.click(screen.getByRole('button', { name: 'Add class' }));
    const d = within(dialog());
    fireEvent.change(d.getByLabelText('Title'), { target: { value: 'Bad' } });
    fireEvent.change(d.getByLabelText('Date'), { target: { value: '2099-02-03' } });
    fireEvent.change(d.getByLabelText('End'), { target: { value: '08:00' } });
    fireEvent.click(d.getByLabelText('G1'));
    fireEvent.click(d.getByRole('button', { name: 'Save' }));
    expect(await d.findByRole('alert')).toHaveTextContent('End must be after start.');
  });

  it('edits a session and prefills the form', async () => {
    open();
    await screen.findByText('Progress review (fictional)');
    fireEvent.click(screen.getByRole('button', { name: /^Edit Progress review/ }));
    const d = within(dialog());
    expect(d.getByLabelText('Title')).toHaveValue('Progress review (fictional)');
    expect(d.getByLabelText('Lab block')).toHaveValue('none');
    expect(d.getByLabelText('G6')).toBeChecked();
    fireEvent.change(d.getByLabelText('Title'), { target: { value: 'Review renamed' } });
    fireEvent.click(d.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('listitem', { name: 'Review renamed' })).toBeInTheDocument();
  });

  it('edits time slots: groups are exclusive, add up to 6, remove, and saves two slots', async () => {
    open();
    await screen.findByText('Progress review (fictional)');
    fireEvent.click(screen.getByRole('button', { name: 'Add class' }));
    const d = within(dialog());
    expect(d.queryByRole('button', { name: /^Remove/ })).toBeNull();
    fireEvent.change(d.getByLabelText('Title'), { target: { value: 'Two slots' } });
    fireEvent.change(d.getByLabelText('Date'), { target: { value: '2099-02-03' } });
    fireEvent.click(d.getByRole('button', { name: '+ Add slot' }));
    const s1 = within(d.getByRole('group', { name: 'Slot 1' }));
    const s2 = within(d.getByRole('group', { name: 'Slot 2' }));
    fireEvent.click(s1.getByLabelText('G1'));
    expect(s2.getByLabelText('G1')).toBeDisabled();
    fireEvent.click(s2.getByLabelText('G2'));
    expect(s1.getByLabelText('G2')).toBeDisabled();
    fireEvent.change(s2.getByLabelText('Start'), { target: { value: '13:00' } });
    fireEvent.change(s2.getByLabelText('End'), { target: { value: '16:00' } });
    for (let n = 0; n < 4; n++) fireEvent.click(d.getByRole('button', { name: '+ Add slot' }));
    expect(d.queryByRole('button', { name: '+ Add slot' })).toBeNull();
    for (let n = 6; n > 2; n--) fireEvent.click(d.getByRole('button', { name: `Remove slot ${n}` }));
    fireEvent.click(d.getByRole('button', { name: 'Save' }));
    const item = await screen.findByRole('listitem', { name: 'Two slots' });
    expect(item).toHaveTextContent('09:00–12:00 · G1');
    expect(item).toHaveTextContent('13:00–16:00 · G2');
  });

  it('deletes after confirming', async () => {
    open();
    await screen.findByText('Progress review (fictional)');
    fireEvent.click(screen.getByRole('button', { name: /^Delete Progress review/ }));
    expect(dialog()).toHaveTextContent('Delete “Progress review (fictional)”');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByText('Progress review (fictional)')).toBeNull());
  });

  it('is read-only for an archived cohort', async () => {
    localStorage.setItem('ios.admin.cohort', '00000000-0000-4000-8000-000000000251');
    open();
    await screen.findByRole('heading', { name: 'Classes — 25.1' });
    expect(await screen.findByText(/class sessions are read-only/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add class' })).toBeNull();
    expect(screen.getAllByText('No upcoming classes.').length).toBe(1);
  });
});

describe('admin classes: notify when it opens (S19)', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('shows a tick per linked item and saves notify_content_ids', async () => {
    vi.stubEnv('VITE_FEATURE_PUSH', 'on');
    open();
    await screen.findByText('Progress review (fictional)');
    fireEvent.click(screen.getByRole('button', { name: 'Add class' }));
    const d = within(dialog());
    expect(d.getByText("Class reminders go out at 18:00 the evening before, to each slot's groups.")).toBeInTheDocument();
    expect(d.queryByLabelText('Notify when it opens')).toBeNull();
    fireEvent.change(d.getByLabelText('Title'), { target: { value: 'Notify class' } });
    fireEvent.change(d.getByLabelText('Date'), { target: { value: '2099-02-03' } });
    fireEvent.click(within(d.getByRole('group', { name: 'Slot 1' })).getByLabelText('G1'));
    fireEvent.click(d.getByLabelText(/Tutorial 3 — Draft/));
    const tick = d.getByLabelText('Notify when it opens');
    expect(tick).not.toBeChecked();
    fireEvent.click(tick);
    fireEvent.click(d.getByRole('button', { name: 'Save' }));
    await screen.findByRole('listitem', { name: 'Notify class' });
    const list = await api.adminListClassSessions('00000000-0000-4000-8000-000000000252');
    const saved = list.ok ? list.data.find((s) => s.title === 'Notify class') : undefined;
    expect(saved?.content.find((c) => c.id === 'content-t3')?.notify).toBe(true);
  });

  it('hides the tick and help text when the flag is off', async () => {
    open();
    await screen.findByText('Progress review (fictional)');
    fireEvent.click(screen.getByRole('button', { name: 'Add class' }));
    fireEvent.click(within(dialog()).getByLabelText(/Tutorial 3 — Draft/));
    expect(within(dialog()).queryByLabelText('Notify when it opens')).toBeNull();
    expect(within(dialog()).queryByText(/Class reminders go out/)).toBeNull();
  });
});
