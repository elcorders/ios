import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from '../routes';
import { api } from '../api';
import { resetMockAuth } from '../api/mock/auth';
import { MOCK_ARCHIVED_COHORT, MOCK_COHORT } from '../api/mock/fixtures/s1';

function open(path: string) {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
}
const signIn = (email: string) => api.verifyEmailCode(email, '123456');

beforeEach(() => resetMockAuth());

describe('survey gate', () => {
  it('redirects an unanswered student from home to /survey', async () => {
    await signIn('student004@example.edu');
    open('/');
    expect(await screen.findByText('Do you have access to a Mac now?')).toBeInTheDocument();
  });


  it('does not gate answered students or instructors', async () => {
    await signIn('student001@example.edu');
    open('/');
    expect(await screen.findByText(/Signed in as/)).toBeInTheDocument();
    expect(screen.getByText(/Your group:/)).toHaveTextContent('Group');
  });

  it('does not gate instructors', async () => {
    await signIn('instructor001@example.edu');
    open('/');
    expect(await screen.findByText(/Signed in as/)).toBeInTheDocument();
  });

  it('confirm step, then group, then Continue goes home with the group shown', async () => {
    await signIn('student004@example.edu');
    open('/survey');
    fireEvent.click(await screen.findByRole('button', { name: 'Yes' }));
    expect(screen.getByText(/can't change this yourself/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText(/You're in/)).toHaveTextContent(/Group \d/);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(/Signed in as/)).toBeInTheDocument();
    expect(screen.getByText(/Your group:/)).toHaveTextContent(/Group \d/);
  });

  it('Go back returns to the question', async () => {
    await signIn('student004@example.edu');
    open('/survey');
    fireEvent.click(await screen.findByRole('button', { name: 'No' }));
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(screen.getByRole('button', { name: 'Yes' })).toBeInTheDocument();
  });

  it('shows a message for an API error code', async () => {
    await signIn('student004@example.edu');
    vi.spyOn(api, 'submitSurvey').mockResolvedValueOnce({ ok: false, error: { code: 'cohort_archived', message: 'x' } });
    open('/survey');
    fireEvent.click(await screen.findByRole('button', { name: 'Yes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/archived/);
    vi.restoreAllMocks();
  });

  it('answered student on /survey is sent home', async () => {
    await signIn('student001@example.edu');
    open('/survey');
    expect(await screen.findByText(/Signed in as/)).toBeInTheDocument();
  });
});

describe('mock submitSurvey', () => {
  it('is idempotent and ignores a changed answer', async () => {
    await signIn('student004@example.edu');
    const a = await api.submitSurvey(MOCK_COHORT.id, true);
    const b = await api.submitSurvey(MOCK_COHORT.id, false);
    expect(a.ok && b.ok && a.data.group_no === b.data.group_no && b.data.has_mac === true).toBe(true);
  });

  it('balances groups per answer (differ by at most 1)', async () => {
    const emails = [4, 6, 8, 10, 11, 12].map((n) => `student${String(n).padStart(3, '0')}@example.edu`);
    for (const [i, email] of emails.entries()) {
      await signIn(email);
      await api.submitSurvey(MOCK_COHORT.id, i % 2 === 0);
    }
    await signIn('admin@example.edu');
    const res = await api.adminListSurvey(MOCK_COHORT.id);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    for (const key of ['has_mac', 'no_mac'] as const) {
      const v = res.data.groups.map((g) => g[key]);
      expect(Math.max(...v) - Math.min(...v)).toBeLessThanOrEqual(1);
    }
    const sizes = res.data.groups.map((g) => g.size);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    expect(res.data.counts.answered).toBe(res.data.counts.has_mac + res.data.counts.no_mac);
  });

  it('rejects a cohort the student is not in and an archived cohort', async () => {
    await signIn('student004@example.edu');
    const a = await api.submitSurvey('nope', true);
    expect(!a.ok && a.error.code).toBe('forbidden');
    await signIn('student001@example.edu');
    const b = await api.submitSurvey(MOCK_ARCHIVED_COHORT.id, true);
    expect(!b.ok && b.error.code).toBe('cohort_archived');
  });
});
