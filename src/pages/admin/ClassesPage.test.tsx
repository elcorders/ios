import { beforeEach, describe, expect, it } from 'vitest';
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
    expect(upcoming.getAllByRole('listitem', { name: /Tutorial 2/ })).toHaveLength(2);
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
    expect(await d.findByRole('alert')).toHaveTextContent('at least one group');
    fireEvent.click(d.getByLabelText('Group 2'));
    fireEvent.change(d.getByLabelText(/Deliverables/), { target: { value: 'Item A\n\nItem B' } });
    fireEvent.change(d.getByLabelText('Lab block'), { target: { value: 'time' } });
    fireEvent.change(d.getByLabelText('Lab blocked until'), { target: { value: '14:30' } });
    fireEvent.click(d.getByLabelText(/Tutorial 3 — Draft/));
    fireEvent.click(d.getByLabelText(/Setup guide/));
    fireEvent.click(d.getByRole('button', { name: 'Save' }));
    const item = await screen.findByRole('listitem', { name: 'Lab clinic' });
    expect(item).toHaveTextContent('Group 2');
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
    fireEvent.click(d.getByRole('button', { name: 'Save' }));
    expect(await d.findByRole('alert')).toHaveTextContent('after the start');
  });

  it('edits a session and prefills the form', async () => {
    open();
    await screen.findByText('Progress review (fictional)');
    fireEvent.click(screen.getByRole('button', { name: /^Edit Progress review/ }));
    const d = within(dialog());
    expect(d.getByLabelText('Title')).toHaveValue('Progress review (fictional)');
    expect(d.getByLabelText('Lab block')).toHaveValue('none');
    expect(d.getByLabelText('Group 6')).toBeChecked();
    fireEvent.change(d.getByLabelText('Title'), { target: { value: 'Review renamed' } });
    fireEvent.click(d.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('listitem', { name: 'Review renamed' })).toBeInTheDocument();
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
