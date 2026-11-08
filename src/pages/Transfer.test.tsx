import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from '../routes';
import { api } from '../api';
import { resetMockAuth } from '../api/mock/auth';
import { MOCK_COHORT } from '../api/mock/fixtures/s1';
import { setMockTransfersOpen } from '../api/mock/cohortState';

function open(path = '/transfer') {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
}
async function signIn(n: number) {
  await api.verifyEmailCode(`student${String(n).padStart(3, '0')}@example.edu`, '123456');
}

beforeEach(() => {
  resetMockAuth();
});

describe('transfer page', () => {
  it('shows the open request and cancels it after confirming', async () => {
    await signIn(1);
    open();
    expect(await screen.findByText('Waiting for approval')).toBeInTheDocument();
    expect(screen.getByText(/Your group:/)).toBeInTheDocument();
    expect(screen.getByText(/I sit with my project partner/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Request a group change' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel request' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel request' }));
    expect(await screen.findByRole('heading', { name: 'Request a group change' })).toBeInTheDocument();
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  it('validates the form and creates a request', async () => {
    await signIn(7);
    open();
    await screen.findByRole('heading', { name: 'Request a group change' });
    const submit = screen.getByRole('button', { name: 'Submit' });
    expect(submit).toBeDisabled();
    const p1 = screen.getByLabelText('Preference 1');
    const p2 = screen.getByLabelText('Preference 2');
    // current group is never offered
    const mine = /Group (\d+)/.exec(screen.getByText(/Your group:/).textContent ?? '')![1]!;
    expect(within(p1).queryByRole('option', { name: `Group ${mine}` })).toBeNull();
    fireEvent.change(p1, { target: { value: (within(p1).getAllByRole('option')[1] as HTMLOptionElement).value } });
    const chosen = (p1 as HTMLSelectElement).selectedOptions[0]!.textContent!;
    expect(within(p2).queryByRole('option', { name: chosen })).toBeNull();
    fireEvent.change(p2, { target: { value: (within(p2).getAllByRole('option')[1] as HTMLOptionElement).value } });
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'abc' } });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'abcdefg' } });
    expect(screen.getByText(/7\/500/)).toBeInTheDocument();
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    expect(await screen.findByText('Waiting for approval')).toBeInTheDocument();
    expect(screen.getByText(/Reason: abcdefg/)).toBeInTheDocument();
  });

  it('shows the closed state', async () => {
    setMockTransfersOpen(MOCK_COHORT.id, false);
    await signIn(7);
    open();
    expect(await screen.findByText('Transfer requests are closed right now.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull();
  });

  it('renders history', async () => {
    await signIn(5);
    open();
    expect(await screen.findByText('Not approved')).toBeInTheDocument();
    expect(screen.getByText('Groups are full this week.')).toBeInTheDocument();
  });

  it('home links to the transfer page', async () => {
    await signIn(1);
    open('/');
    const link = await screen.findByRole('link', { name: 'Request a group change' });
    expect(link).toHaveAttribute('href', '/transfer');
    await waitFor(() => expect(screen.getByText(/Your group:/)).toBeInTheDocument());
  });
});
