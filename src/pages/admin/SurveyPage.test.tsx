import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from '../../routes';
import { api } from '../../api';
import { resetMockAuth } from '../../api/mock/auth';
import { resetMockAdmin } from '../../api/mock/admin';

function open(path: string) {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
}

beforeEach(() => {
  resetMockAuth();
  resetMockAdmin();
  localStorage.clear();
});

describe('admin survey tab', () => {
  it('shows counts, groups and rows, and filters', async () => {
    await api.verifyEmailCode('admin@example.edu', '123456');
    open('/admin/survey');
    expect(await screen.findByText(/Answered 5 \/ 11/)).toBeInTheDocument();
    expect(screen.getByText('Has Mac 3')).toBeInTheDocument();
    expect(screen.getByText('No Mac 2')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /Groups of cohort/ })).toBeInTheDocument();
    const rows = screen.getByRole('table', { name: /Survey answers/ });
    expect(within(rows).getAllByRole('row')).toHaveLength(12);

    fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'unanswered' } });
    expect(within(rows).getAllByRole('row')).toHaveLength(7);
    fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'nomac' } });
    expect(within(rows).getAllByRole('row')).toHaveLength(3);

    fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'all' } });
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'student004' } });
    expect(within(rows).getAllByRole('row')).toHaveLength(2);
    expect(within(rows).getAllByText("—").length).toBeGreaterThan(0);
  });

  it('is forbidden through the mock for students', async () => {
    await api.verifyEmailCode('student001@example.edu', '123456');
    const res = await api.adminListSurvey('00000000-0000-4000-8000-000000000252');
    expect(!res.ok && res.error.code).toBe('forbidden');
  });
});
