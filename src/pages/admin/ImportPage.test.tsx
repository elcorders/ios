import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from '../../routes';
import { api } from '../../api';
import { resetMockAuth } from '../../api/mock/auth';
import { resetMockAdmin } from '../../api/mock/admin';

beforeEach(async () => {
  resetMockAuth();
  resetMockAdmin();
  localStorage.clear();
  await api.verifyEmailCode('admin@example.edu', '123456');
});

async function openImport() {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/admin/import'] })} />);
  return screen.findByLabelText(/File \(CSV/);
}

const csv = (text: string) => new File([text], 'roster.csv', { type: 'text/csv' });

describe('ImportPage', () => {
  it('checks and applies a small CSV', async () => {
    const input = await openImport();
    fireEvent.change(input, {
      target: {
        files: [csv('Email,Full Name,Index No\nstudent080@example.edu,Test Eighty,COBSCCOMP251P-080\nbad,Nope Person,\n')],
      },
    });
    expect(await screen.findByText(/roster\.csv: 2 rows/)).toBeInTheDocument();
    expect(screen.getByLabelText('Full name (split)')).not.toHaveValue('-1');
    const apply = screen.getByRole('button', { name: 'Apply' });
    expect(apply).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText('Add (1)')).toBeInTheDocument();
    expect(screen.getByText(/Row 3: invalid_email/)).toBeInTheDocument();
    expect(screen.getByText(/Not in file \(/)).toBeInTheDocument();
    await waitFor(() => expect(apply).toBeEnabled());

    fireEvent.click(apply);
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply import' }));
    expect(await screen.findByText(/Import applied: 1 added/)).toBeInTheDocument();

    const members = await api.listMembers('00000000-0000-4000-8000-000000000252', 'student');
    expect(members.ok && members.data.some((m) => m.email === 'student080@example.edu')).toBe(true);
  });

  it('refuses files over 500 rows', async () => {
    const input = await openImport();
    const lines = Array.from({ length: 501 }, (_, i) => `student${i}@example.edu,A,B`);
    fireEvent.change(input, { target: { files: [csv(`Email,First Name,Last Name\n${lines.join('\n')}`)] } });
    expect(await screen.findByText(/Too many rows \(501\)/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check' })).toBeDisabled();
  });

  it('adds one person', async () => {
    await openImport();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'student090@example.edu' } });
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Solo' } });
    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Person' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add person' }));
    expect(await screen.findByText('Added student090@example.edu.')).toBeInTheDocument();
  });

  it('shows email changes and a summary, and flags email conflicts', async () => {
    const input = await openImport();
    fireEvent.change(input, {
      target: {
        files: [csv([
          'Email,First Name,Last Name,Index No',
          'new001@example.edu,Test001,Student,COBSCCOMP251P-001',
          'student003@example.edu,Test003,Student,COBSCCOMP251P-002',
        ].join('\n'))],
      },
    });
    await screen.findByText(/roster\.csv: 2 rows/);
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText('1 email change')).toBeInTheDocument();
    expect(screen.getByText('Email: student001@example.edu → new001@example.edu')).toBeInTheDocument();
    expect(screen.getByText('Email change')).toBeInTheDocument();
    expect(screen.getByText(/Row 3: email_conflict — This email already belongs to another member/)).toBeInTheDocument();
  });
});
