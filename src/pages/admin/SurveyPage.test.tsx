import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from '../../routes';
import { api } from '../../api';
import { resetMockAuth } from '../../api/mock/auth';
import { resetMockAdmin } from '../../api/mock/admin';
import { resetMockSurvey } from '../../api/mock/survey';

function open(path: string) {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
}

beforeEach(() => {
  resetMockAuth();
  resetMockAdmin();
  resetMockSurvey();
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

  it('resets selected answers: student keeps the group and must answer again', async () => {
    await api.verifyEmailCode('admin@example.edu', '123456');
    open('/admin/survey');
    const rows = await screen.findByRole('table', { name: /Survey answers/ });
    const before = (await api.adminListSurvey('00000000-0000-4000-8000-000000000252'));
    const row1 = before.ok ? before.data.rows.find((r) => r.email === 'student001@example.edu')! : null;
    expect(row1?.has_mac).toBe(true);

    // unanswered rows have no checkbox
    expect(within(rows).queryByLabelText('Select student004@example.edu')).toBeNull();
    fireEvent.click(within(rows).getByLabelText('Select student001@example.edu'));
    fireEvent.click(within(rows).getByLabelText('Select student002@example.edu'));
    fireEvent.click(screen.getByRole('button', { name: 'Reset answer' }));
    const dialog = screen.getByRole('dialog', { name: 'Reset survey answers' });
    expect(within(dialog).getByText(/2 students/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset' }));

    expect(await screen.findByText(/Reset 2 answers/)).toBeInTheDocument();
    expect(await screen.findByText(/Answered 3 \/ 11/)).toBeInTheDocument();
    const after = await api.adminListSurvey('00000000-0000-4000-8000-000000000252');
    const r1 = after.ok ? after.data.rows.find((r) => r.email === 'student001@example.edu')! : null;
    expect(r1?.has_mac).toBeNull();
    expect(r1?.group_no).toBe(row1?.group_no);

    // student answers again (different answer) and keeps the group
    await api.verifyEmailCode('student001@example.edu', '123456');
    const me = await api.getMe();
    const enr = me.ok ? me.data.enrolments.find((e) => e.cohort_id === '00000000-0000-4000-8000-000000000252') : undefined;
    expect(enr?.survey_done).toBe(false);
    const res = await api.submitSurvey('00000000-0000-4000-8000-000000000252', false);
    expect(res.ok && res.data.group_no).toBe(row1?.group_no);
    expect(res.ok && res.data.has_mac).toBe(false);
  });

  it('reset is forbidden for students and rejects unknown ids', async () => {
    await api.verifyEmailCode('student001@example.edu', '123456');
    const res = await api.adminResetSurvey('00000000-0000-4000-8000-000000000252', ['x']);
    expect(!res.ok && res.error.code).toBe('forbidden');
    await api.verifyEmailCode('admin@example.edu', '123456');
    const bad = await api.adminResetSurvey('00000000-0000-4000-8000-000000000252', ['nope']);
    expect(!bad.ok && bad.error.code).toBe('not_found');
    const empty = await api.adminResetSurvey('00000000-0000-4000-8000-000000000252', []);
    expect(!empty.ok && empty.error.code).toBe('invalid_input');
  });

  it('is forbidden through the mock for students', async () => {
    await api.verifyEmailCode('student001@example.edu', '123456');
    const res = await api.adminListSurvey('00000000-0000-4000-8000-000000000252');
    expect(!res.ok && res.error.code).toBe('forbidden');
  });
});
