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

const COHORT = '00000000-0000-4000-8000-000000000252';
const slotOf = (n: number) => within(dialog()).getByRole('group', { name: `Slot ${n}` });
const addDay = async () => {
  open();
  await screen.findByText('Progress review (fictional)');
  fireEvent.click(screen.getByRole('button', { name: 'Add class day' }));
  const d = within(dialog());
  fireEvent.change(d.getByLabelText('Title'), { target: { value: 'Lab clinic' } });
  fireEvent.change(d.getByLabelText('Date'), { target: { value: '2099-02-03' } });
  return d;
};
const saved = async (title: string) => {
  const list = await api.adminListClassSessions(COHORT);
  return list.ok ? list.data.find((s) => s.title === title) : undefined;
};

describe('admin classes tab', () => {
  it('lists upcoming and past class days as cards with template, slots, groups, items and lab block', async () => {
    open();
    await screen.findByRole('heading', { name: 'Classes — 25.2' });
    await screen.findByText('Progress review (fictional)');
    const upcoming = within(screen.getByRole('region', { name: 'Upcoming classes' }));
    const t2 = within(upcoming.getByRole('listitem', { name: /Tutorial 2/ }));
    expect(t2.getByText('Slot 1', { selector: 'strong' })).toBeInTheDocument();
    expect(t2.getByText('09:00–12:00')).toBeInTheDocument();
    expect(t2.getByText('G1, G2, G3')).toBeInTheDocument();
    expect(t2.getByText('13:00–16:00')).toBeInTheDocument();
    expect(t2.getAllByText('Week 2 slides — Layouts')).toHaveLength(2);
    expect(t2.getAllByText('Opens 09:00')).toHaveLength(1);
    expect(t2.getAllByText(/No notification/)).toHaveLength(2);
    expect(upcoming.getByText('Progress review (fictional)')).toBeInTheDocument();
    expect(upcoming.getByText("Doesn't block the lab")).toBeInTheDocument();
    expect(upcoming.getByText('Lab blocked all day')).toBeInTheDocument();
    expect(upcoming.getAllByText('2 deliverables').length).toBeGreaterThan(0);
    const past = within(screen.getByRole('region', { name: 'Past classes' }));
    expect(past.getByText('Tutorial 1 — Demo game (fictional)')).toBeInTheDocument();
  });

  it('adds a class day: empty slots are dropped on save, a slot with items but no groups is an error', async () => {
    const d = await addDay();
    fireEvent.click(d.getByRole('button', { name: 'Save' }));
    expect(await d.findByRole('alert')).toHaveTextContent('Pick at least one group in a slot.');
    expect(d.getByText(/Slots with no groups and no items are dropped when you save/)).toBeInTheDocument();
    expect(d.getByText(/Items open for that slot's groups at its start\. Other groups get them only when set on their own slot, or when you publish them\./)).toBeInTheDocument();

    fireEvent.click(within(slotOf(1)).getByRole('button', { name: '+ Add tutorial / material' }));
    fireEvent.click(within(slotOf(1)).getByLabelText(/Tutorial 3 — Draft/));
    fireEvent.click(d.getByRole('button', { name: 'Save' }));
    expect(await d.findByRole('alert')).toHaveTextContent('Pick at least one group for Slot 1.');

    fireEvent.click(within(slotOf(1)).getByLabelText('G2'));
    fireEvent.click(d.getByRole('button', { name: '+ Add slot' }));
    fireEvent.change(d.getByLabelText('Deliverables (one per line)'), { target: { value: 'Item A\n\nItem B' } });
    fireEvent.change(d.getByLabelText('Lab block'), { target: { value: 'time' } });
    fireEvent.change(d.getByLabelText('Lab blocked until'), { target: { value: '14:30' } });
    fireEvent.click(d.getByRole('button', { name: 'Save' }));
    const item = await screen.findByRole('listitem', { name: 'Lab clinic' });
    expect(item).toHaveTextContent('Slot 1');
    expect(item).toHaveTextContent('G2');
    expect(item).toHaveTextContent('2 deliverables');
    expect(item).toHaveTextContent('Lab blocked until 14:30');
    expect(item).toHaveTextContent(/Tutorial 3 — Draft · tutorial/);
    expect(item).toHaveTextContent('Notify at 12:00');
    const s = await saved('Lab clinic');
    expect(s?.slots).toHaveLength(1);
    expect(s?.slots[0]?.content[0]).toMatchObject({ id: 'content-t3', notify: 'slot_end' });
  });

  it('shows an error when the end is not after the start', async () => {
    const d = await addDay();
    fireEvent.change(within(slotOf(1)).getByLabelText('End'), { target: { value: '08:00' } });
    fireEvent.click(within(slotOf(1)).getByLabelText('G1'));
    fireEvent.click(d.getByRole('button', { name: 'Save' }));
    expect(await d.findByRole('alert')).toHaveTextContent('End must be after start.');
  });

  it('edits a class day and prefills the form', async () => {
    open();
    await screen.findByText('Progress review (fictional)');
    fireEvent.click(screen.getByRole('button', { name: /^Edit Progress review/ }));
    const d = within(dialog());
    expect(d.getByLabelText('Title')).toHaveValue('Progress review (fictional)');
    expect(d.getByLabelText('Lab block')).toHaveValue('none');
    expect(within(slotOf(1)).getByLabelText('G6')).toBeChecked();
    fireEvent.change(d.getByLabelText('Title'), { target: { value: 'Review renamed' } });
    fireEvent.click(d.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('listitem', { name: 'Review renamed' })).toBeInTheDocument();
  });

  it('keeps a group in one slot only, adds up to 6 slots, removes slots, and saves two slots', async () => {
    const d = await addDay();
    expect(d.queryByRole('button', { name: /^Remove slot/ })).toBeNull();
    fireEvent.click(d.getByRole('button', { name: '+ Add slot' }));
    fireEvent.click(within(slotOf(1)).getByLabelText('G1'));
    expect(within(slotOf(2)).getByLabelText('G1')).toBeDisabled();
    fireEvent.click(within(slotOf(2)).getByLabelText('G2'));
    expect(within(slotOf(1)).getByLabelText('G2')).toBeDisabled();
    fireEvent.change(within(slotOf(2)).getByLabelText('Start'), { target: { value: '13:00' } });
    fireEvent.change(within(slotOf(2)).getByLabelText('End'), { target: { value: '16:00' } });
    for (let n = 0; n < 4; n++) fireEvent.click(d.getByRole('button', { name: '+ Add slot' }));
    expect(d.queryByRole('button', { name: '+ Add slot' })).toBeNull();
    for (let n = 6; n > 2; n--) fireEvent.click(d.getByRole('button', { name: `Remove slot ${n}` }));
    fireEvent.click(d.getByRole('button', { name: 'Save' }));
    await screen.findByRole('listitem', { name: 'Lab clinic' });
    const s = await saved('Lab clinic');
    expect(s?.slots.map((x) => [x.start_time, x.end_time, x.group_nos])).toEqual([['09:00', '12:00', [1]], ['13:00', '16:00', [2]]]);
  });

  it('applies a template to the slots (keeping groups by position) and saves its id', async () => {
    const d = await addDay();
    fireEvent.click(within(slotOf(1)).getByLabelText('G3'));
    fireEvent.change(d.getByLabelText('Template (optional)'), { target: { value: '00000000-0000-4000-8000-0000000024a1' } });
    fireEvent.click(d.getByRole('button', { name: 'Use template' }));
    expect(within(slotOf(1)).getByLabelText('Label')).toHaveValue('Slot 1');
    expect(within(slotOf(1)).getByLabelText('End')).toHaveValue('11:00');
    expect(within(slotOf(1)).getByLabelText('G3')).toBeChecked();
    expect(slotOf(3)).toBeInTheDocument();
    fireEvent.click(within(slotOf(3)).getByLabelText('G5'));
    fireEvent.click(d.getByRole('button', { name: 'Save' }));
    await screen.findByRole('listitem', { name: 'Lab clinic' });
    const s = await saved('Lab clinic');
    expect(s?.template_id).toBe('00000000-0000-4000-8000-0000000024a1');
    expect(s?.slots.map((x) => [x.label, x.start_time, x.end_time, x.group_nos])).toEqual([['Slot 1', '09:00', '11:00', [3]], ['Slot 3', '14:00', '16:00', [5]]]);
    expect(screen.getByRole('listitem', { name: 'Lab clinic' })).toHaveTextContent('Day (3 slots)');
  });

  it('asks before replacing slots that were edited by hand', async () => {
    const d = await addDay();
    fireEvent.change(within(slotOf(1)).getByLabelText('Start'), { target: { value: '08:00' } });
    fireEvent.change(d.getByLabelText('Template (optional)'), { target: { value: '00000000-0000-4000-8000-0000000024a1' } });
    expect(d.getByRole('group', { name: 'Replace slots' })).toBeInTheDocument();
    expect(within(slotOf(1)).getByLabelText('Start')).toHaveValue('08:00');
    fireEvent.click(d.getByRole('button', { name: 'Keep my slots' }));
    expect(d.queryByRole('group', { name: 'Replace slots' })).toBeNull();
    fireEvent.change(d.getByLabelText('Template (optional)'), { target: { value: '00000000-0000-4000-8000-0000000024a1' } });
    fireEvent.click(d.getByRole('button', { name: 'Use template' }));
    expect(within(slotOf(1)).getByLabelText('Start')).toHaveValue('09:00');
  });

  it('puts items per slot with their own notify choice (slot end, at a time, none)', async () => {
    const d = await addDay();
    fireEvent.click(d.getByRole('button', { name: '+ Add slot' }));
    fireEvent.click(within(slotOf(1)).getByLabelText('G1'));
    fireEvent.click(within(slotOf(2)).getByLabelText('G2'));
    fireEvent.change(within(slotOf(2)).getByLabelText('Start'), { target: { value: '13:00' } });
    fireEvent.change(within(slotOf(2)).getByLabelText('End'), { target: { value: '16:00' } });
    fireEvent.click(within(slotOf(1)).getByRole('button', { name: '+ Add tutorial / material' }));
    fireEvent.change(within(slotOf(1)).getByLabelText('Search items for Slot 1'), { target: { value: 'draft' } });
    expect(within(slotOf(1)).queryByLabelText(/Setup guide/)).toBeNull();
    fireEvent.click(within(slotOf(1)).getByLabelText(/Tutorial 3 — Draft/));
    fireEvent.click(within(slotOf(1)).getByRole('button', { name: 'Done' }));
    fireEvent.click(within(slotOf(2)).getByRole('button', { name: '+ Add tutorial / material' }));
    fireEvent.click(within(slotOf(2)).getByLabelText(/Tutorial 3 — Draft/));
    fireEvent.click(within(slotOf(2)).getByLabelText(/Setup guide/));
    const t3a = within(slotOf(1)).getByLabelText('Notify for Tutorial 3 — Draft in Slot 1');
    expect(t3a).toHaveValue('slot_end');
    expect(within(t3a).getAllByRole('option').map((o) => o.textContent)).toEqual(['At slot end', 'At…', "Don't notify"]);
    fireEvent.change(within(slotOf(2)).getByLabelText('Notify for Tutorial 3 — Draft in Slot 2'), { target: { value: 'at' } });
    expect(within(slotOf(2)).getByLabelText('Notification time for Tutorial 3 — Draft in Slot 2')).toHaveValue('2099-02-03T16:00');
    fireEvent.change(within(slotOf(2)).getByLabelText('Notification time for Tutorial 3 — Draft in Slot 2'), { target: { value: '2099-02-03T14:30' } });
    fireEvent.change(within(slotOf(2)).getByLabelText('Notify for Setup guide in Slot 2'), { target: { value: 'none' } });
    fireEvent.click(d.getByRole('button', { name: 'Save' }));
    await screen.findByRole('listitem', { name: 'Lab clinic' });
    const s = await saved('Lab clinic');
    expect(s?.slots[0]?.content[0]).toMatchObject({ id: 'content-t3', notify: 'slot_end', notify_at: null });
    expect(s?.slots[1]?.content.map((c) => [c.id, c.notify, c.notify_at])).toEqual([
      ['content-t3', 'at', new Date('2099-02-03T14:30:00+05:30').toISOString()],
      ['content-m2', 'none', null],
    ]);
    const card = screen.getByRole('listitem', { name: 'Lab clinic' });
    expect(card).toHaveTextContent('Notify 03 Feb 14:30');
    expect(card).toHaveTextContent('No notification');
  });

  it('rejects a notification time before the slot starts', async () => {
    const d = await addDay();
    fireEvent.click(within(slotOf(1)).getByLabelText('G1'));
    fireEvent.click(within(slotOf(1)).getByRole('button', { name: '+ Add tutorial / material' }));
    fireEvent.click(within(slotOf(1)).getByLabelText(/Tutorial 3 — Draft/));
    fireEvent.change(within(slotOf(1)).getByLabelText('Notify for Tutorial 3 — Draft in Slot 1'), { target: { value: 'at' } });
    fireEvent.change(within(slotOf(1)).getByLabelText('Notification time for Tutorial 3 — Draft in Slot 1'), { target: { value: '2099-02-03T08:00' } });
    fireEvent.click(d.getByRole('button', { name: 'Save' }));
    expect(await d.findByRole('alert')).toHaveTextContent('Slot 1: pick a notification time that is not before the slot starts.');
  });

  it('duplicates a class day: same slots and groups, new date, items cleared', async () => {
    open();
    await screen.findByText('Progress review (fictional)');
    fireEvent.click(screen.getByRole('button', { name: /^Duplicate Tutorial 2/ }));
    const d = within(dialog());
    expect(d.getByRole('heading', { name: 'Duplicate class day' })).toBeInTheDocument();
    expect(d.getByLabelText('Date')).toHaveValue('');
    expect(d.getByLabelText('Title')).toHaveValue('Tutorial 2 — Layouts (fictional)');
    expect(within(slotOf(2)).getByLabelText('G4')).toBeChecked();
    expect(within(slotOf(1)).getByText('None.')).toBeInTheDocument();
    fireEvent.change(d.getByLabelText('Date'), { target: { value: '2099-03-03' } });
    fireEvent.click(d.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getAllByRole('listitem', { name: /Tutorial 2/ })).toHaveLength(2));
    const list = await api.adminListClassSessions(COHORT);
    const copy = list.ok ? list.data.find((s) => s.date === '2099-03-03') : undefined;
    expect(copy?.slots.map((x) => x.group_nos)).toEqual([[1, 2, 3], [4, 5, 6]]);
    expect(copy?.content).toEqual([]);
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
    expect(screen.queryByRole('button', { name: 'Add class day' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Templates' })).toBeNull();
    expect(screen.getAllByText('No upcoming classes.').length).toBe(1);
  });
});

describe('admin classes: templates dialog', () => {
  const openTemplates = async () => {
    open();
    await screen.findByText('Progress review (fictional)');
    fireEvent.click(screen.getByRole('button', { name: 'Templates' }));
    await within(dialog()).findByRole('listitem', { name: 'Day (3 slots)' });
    return within(dialog());
  };

  it('lists templates with their slots and usage', async () => {
    const d = await openTemplates();
    const row = within(d.getByRole('listitem', { name: 'Day (3 slots)' }));
    expect(row.getByText(/Slot 1 09:00–11:00 · Slot 2 11:00–13:00 · Slot 3 14:00–16:00/)).toBeInTheDocument();
    expect(row.getByText('Not used yet')).toBeInTheDocument();
  });

  it('creates, edits and deletes a template', async () => {
    const d = await openTemplates();
    fireEvent.click(d.getByRole('button', { name: 'New template' }));
    let f = within(dialog());
    fireEvent.click(f.getByRole('button', { name: 'Save' }));
    expect(await f.findByRole('alert')).toHaveTextContent('Give the template a name.');
    fireEvent.change(f.getByLabelText('Template name'), { target: { value: 'Half day' } });
    fireEvent.change(within(f.getByRole('group', { name: 'Template slot 1' })).getByLabelText('Label'), { target: { value: 'Morning' } });
    fireEvent.click(f.getByRole('button', { name: '+ Add slot' }));
    expect(f.getByRole('group', { name: 'Template slot 2' })).toBeInTheDocument();
    fireEvent.click(f.getByRole('button', { name: 'Remove template slot 2' }));
    fireEvent.click(f.getByRole('button', { name: 'Save' }));
    const row = await screen.findByRole('listitem', { name: 'Half day' });
    expect(row).toHaveTextContent('Morning 09:00–11:00');

    fireEvent.click(within(row).getByRole('button', { name: 'Edit template Half day' }));
    f = within(dialog());
    fireEvent.change(f.getByLabelText('Template name'), { target: { value: 'Half day v2' } });
    fireEvent.click(f.getByRole('button', { name: 'Save' }));
    const renamed = await screen.findByRole('listitem', { name: 'Half day v2' });

    fireEvent.click(within(renamed).getByRole('button', { name: 'Delete template Half day v2' }));
    expect(dialog()).toHaveTextContent('Classes keep their times.');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByRole('listitem', { name: 'Half day v2' })).toBeNull());
  });

  it('shows the new template in the class day dialog and reports a name clash', async () => {
    const d = await openTemplates();
    fireEvent.click(d.getByRole('button', { name: 'New template' }));
    const f = within(dialog());
    fireEvent.change(f.getByLabelText('Template name'), { target: { value: 'day (3 slots)' } });
    fireEvent.click(f.getByRole('button', { name: 'Save' }));
    expect(await f.findByRole('alert')).toHaveTextContent('A template with that name already exists.');
    fireEvent.change(f.getByLabelText('Template name'), { target: { value: 'Evening' } });
    fireEvent.click(f.getByRole('button', { name: 'Save' }));
    await screen.findByRole('listitem', { name: 'Evening' });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Done' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add class day' }));
    expect(within(within(dialog()).getByLabelText('Template (optional)')).getAllByRole('option').map((o) => o.textContent)).toEqual(['None', 'Day (3 slots)', 'Evening']);
  });
});

describe('admin classes: class reminders note', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('shows the reminder note only when push is enabled', async () => {
    vi.stubEnv('VITE_FEATURE_PUSH', 'on');
    const d = await addDay();
    expect(d.getByText("Class reminders go out at 18:00 the evening before, to each slot's groups.")).toBeInTheDocument();
  });

  it('hides the reminder note when the flag is off', async () => {
    const d = await addDay();
    expect(d.queryByText(/Class reminders go out/)).toBeNull();
  });
});
