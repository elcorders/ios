import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from '../../routes';
import { api } from '../../api';
import { resetMockAuth } from '../../api/mock/auth';
import { resetMockAdmin } from '../../api/mock/admin';

function open(path: string) {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
}

async function menuItem(person: string, item: string) {
  fireEvent.click(await screen.findByRole('button', { name: `Actions for ${person}` }));
  fireEvent.click(screen.getByRole('menuitem', { name: `${item} ${person}` }));
}

const dataRows = () => screen.getAllByRole('row').slice(1);

beforeEach(async () => {
  resetMockAuth();
  resetMockAdmin();
  localStorage.clear();
  await api.verifyEmailCode('admin@example.edu', '123456');
});

afterEach(() => vi.restoreAllMocks());

describe('MembersPage', () => {
  it('filters by status chips with counts', async () => {
    open('/admin/members');
    await screen.findByText('student001@example.edu');
    expect(screen.getByRole('button', { name: 'Active 11' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Removed 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discarded 0' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All 12' })).toBeInTheDocument();
    expect(screen.queryByText('student009@example.edu')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Removed 1' }));
    expect(screen.getByText('student009@example.edu')).toBeInTheDocument();
    expect(screen.queryByText('student001@example.edu')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'All 12' }));
    expect(dataRows()).toHaveLength(12);
  });

  it('sorts by clicking headers and exposes aria-sort', async () => {
    open('/admin/members');
    await screen.findByText('student001@example.edu');
    const th = (n: string) => screen.getByRole('columnheader', { name: new RegExp(`^${n}`) });
    expect(th('Index no')).toHaveAttribute('aria-sort', 'ascending');
    expect(dataRows()[0]).toHaveTextContent('student001@example.edu');
    fireEvent.click(within(th('Email')).getByRole('button'));
    expect(th('Email')).toHaveAttribute('aria-sort', 'ascending');
    expect(th('Index no')).toHaveAttribute('aria-sort', 'none');
    fireEvent.click(within(th('Email')).getByRole('button'));
    expect(th('Email')).toHaveAttribute('aria-sort', 'descending');
    expect(dataRows()[0]).toHaveTextContent('student012@example.edu');
    expect(th('Group')).toBeInTheDocument();
  });

  it('discards a member after confirming, then restores it from Discarded', async () => {
    open('/admin/members');
    await menuItem('Test002 Student', 'Discard');
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent(/hidden everywhere/);
    expect(dialog).toHaveTextContent(/can be restored/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Discard' }));
    await screen.findByRole('button', { name: 'Discarded 1' });
    expect(screen.queryByText('student002@example.edu')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Discarded 1' }));
    await menuItem('Test002 Student', 'Restore');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Restore' }));
    await screen.findByRole('button', { name: 'Discarded 0' });
    expect(screen.getByRole('button', { name: 'Active 11' })).toBeInTheDocument();
  });

  it('bulk removes selected rows and summarises one failure', async () => {
    const original = api.adminSetEnrolmentStatus.bind(api);
    const spy = vi.spyOn(api, 'adminSetEnrolmentStatus').mockImplementation(async (id, status) => {
      const members = await api.listMembers('00000000-0000-4000-8000-000000000252', 'student');
      const m = members.ok ? members.data.find((x) => x.enrolment_id === id) : undefined;
      if (m?.email === 'student002@example.edu') return { ok: false, error: { code: 'internal', message: 'x' } };
      return original(id, status);
    });
    open('/admin/members');
    for (const n of ['Test001 Student', 'Test002 Student', 'Test003 Student']) {
      fireEvent.click(await screen.findByRole('checkbox', { name: `Select ${n}` }));
    }
    expect(screen.getByText('3 selected')).toBeInTheDocument();
    const bar = screen.getByRole('region', { name: 'Bulk actions' });
    fireEvent.click(within(bar).getByRole('button', { name: 'Remove' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('2 succeeded, 1 failed');
    expect(alert).toHaveTextContent('Test002 Student');
    expect(spy).toHaveBeenCalledTimes(3);
    await screen.findByRole('button', { name: 'Removed 3' });
    expect(screen.queryByText('3 selected')).not.toBeInTheDocument();
  });

  it('select all selects every filtered row', async () => {
    open('/admin/members');
    await screen.findByText('student001@example.edu');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all shown' }));
    expect(screen.getByText('11 selected')).toBeInTheDocument();
  });

  it('row menu works with the keyboard: arrow open, Esc closes and returns focus, outside click closes', async () => {
    open('/admin/members');
    const trigger = await screen.findByRole('button', { name: 'Actions for Test001 Student' });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const items = await screen.findAllByRole('menuitem');
    await waitFor(() => expect(items[0]).toHaveFocus());
    fireEvent.keyDown(items[0]!, { key: 'ArrowDown' });
    expect(items[1]).toHaveFocus();
    fireEvent.keyDown(items[1]!, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('archived cohort is read-only: no bulk, no menu', async () => {
    localStorage.setItem('ios.admin.cohort', '00000000-0000-4000-8000-000000000251');
    open('/admin/members');
    await screen.findByText('student002@example.edu');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Actions for/ })).not.toBeInTheDocument();
  });
});
