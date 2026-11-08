import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from '../../routes';
import { api } from '../../api';
import { resetMockAuth } from '../../api/mock/auth';
import { resetMockAdmin } from '../../api/mock/admin';

function open(path: string) {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
}

async function openMenu(person: string, item: string) {
  fireEvent.click(await screen.findByRole('button', { name: `Actions for ${person}` }));
  fireEvent.click(screen.getByRole('menuitem', { name: `${item} ${person}` }));
}

const signIn = (email: string) => api.verifyEmailCode(email, '123456');

beforeEach(() => {
  resetMockAuth();
  resetMockAdmin();
  localStorage.clear();
});

describe('admin area', () => {
  it('shows Not allowed to non-admins', async () => {
    await signIn('student001@example.edu');
    open('/admin');
    expect(await screen.findByRole('heading', { name: 'Not allowed' })).toBeInTheDocument();
  });

  it('mock admin methods are forbidden for non-admins', async () => {
    await signIn('student001@example.edu');
    const res = await api.adminListCohorts();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('forbidden');
  });

  it('lists members, searches, and switches to the archived cohort (read-only)', async () => {
    await signIn('admin@example.edu');
    open('/admin');
    expect(await screen.findByText('student001@example.edu')).toBeInTheDocument();
    expect(screen.getByLabelText('Cohort')).toHaveValue('00000000-0000-4000-8000-000000000252');

    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'student005' } });
    expect(screen.getByText('student005@example.edu')).toBeInTheDocument();
    expect(screen.queryByText('student001@example.edu')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Cohort'), { target: { value: '00000000-0000-4000-8000-000000000251' } });
    expect(await screen.findByText(/archived and read-only/)).toBeInTheDocument();
    expect(localStorage.getItem('ios.admin.cohort')).toBe('00000000-0000-4000-8000-000000000251');
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: '' } });
    await screen.findByText('student002@example.edu');
    expect(screen.queryByRole('button', { name: /^Actions for / })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('hides removed members until the Removed chip is chosen', async () => {
    await signIn('admin@example.edu');
    open('/admin/members');
    await screen.findByText('student001@example.edu');
    expect(screen.queryByText('student009@example.edu')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Removed/ }));
    expect(screen.getByText('student009@example.edu')).toBeInTheDocument();
  });

  it('edit dialog submits the profile change', async () => {
    await signIn('admin@example.edu');
    open('/admin/members');
    await openMenu('Test001 Student', 'Edit');
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('Email')).toHaveAttribute('readonly');
    expect(within(dialog).getByText('Change via import.')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('First name'), { target: { value: 'Renamed' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('button', { name: 'Actions for Renamed Student' })).toBeInTheDocument();
  });

  it('shows a friendly error when the edit is rejected', async () => {
    await signIn('admin@example.edu');
    open('/admin/members');
    await openMenu('Test001 Student', 'Edit');
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Index number'), { target: { value: 'COBSCCOMP251P-002' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/clashes/);
  });

  it('removes a member after confirming', async () => {
    await signIn('admin@example.edu');
    open('/admin/members');
    await openMenu('Test002 Student', 'Remove');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(screen.queryByText('student002@example.edu')).not.toBeInTheDocument());
  });

  it('approves a pending row', async () => {
    await signIn('admin@example.edu');
    open('/admin/pending');
    expect(await screen.findByText('student061@example.edu')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Approve student061@example.edu' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Approve' }));
    await screen.findByRole('button', { name: 'Decided 2' });
    expect(screen.queryByRole('button', { name: 'Approve student061@example.edu' })).not.toBeInTheDocument();
  });
});
