import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from '../../routes';
import { api } from '../../api';
import { resetMockAuth } from '../../api/mock/auth';
import { resetMockAdmin } from '../../api/mock/admin';
import { resetMockSurvey } from '../../api/mock/survey';
import { resetMockTransfers } from '../../api/mock/transfers';

function open(path: string) {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
}

beforeEach(async () => {
  resetMockAuth();
  resetMockAdmin();
  resetMockSurvey();
  resetMockTransfers();
  localStorage.clear();
  await api.verifyEmailCode('admin@example.edu', '123456');
});

const card = (name: string) => screen.findByRole('article', { name: `Request from ${name}` });
const sizeOf = async (no: number) => {
  const cohorts = await api.adminListCohorts();
  if (!cohorts.ok) return -1;
  const res = await api.adminListTransfers(cohorts.data.find((c) => c.status === 'active')!.id);
  return res.ok ? res.data.groups.find((g) => g.no === no)!.size : -1;
};

describe('TransfersPage', () => {
  it('renders the queue, counts, suggested badge and the tab count', async () => {
    open('/admin/transfers');
    expect(await screen.findByRole('button', { name: 'Open 3' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Rejected 1' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Group sizes' })).toBeInTheDocument();
    const c = await card('Test003 Student');
    expect(within(c).getAllByText('Suggested')).toHaveLength(1);
    expect(within(c).getByRole('button', { name: 'Approve → Group 6' })).toBeInTheDocument();
    expect(within(c).getByRole('button', { name: 'Reject' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Transfers (3)' })).toBeInTheDocument();
  });

  it('lists the swap pair and approves both', async () => {
    open('/admin/transfers');
    const pair = await screen.findByRole('article', { name: /^Swap / });
    expect(within(pair).getByText('Sizes unchanged')).toBeInTheDocument();
    expect(within(pair).getAllByText(/\(COBSCCOMP251P-0\d\d\)/)).toHaveLength(2);
    fireEvent.click(within(pair).getByRole('button', { name: 'Approve both' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByText(/\(COBSCCOMP251P-0\d\d\)/)).toHaveLength(2);
    fireEvent.change(within(dialog).getByLabelText(/Note/), { target: { value: 'Swapped.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve both' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByRole('article', { name: /^Swap / })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approved 2' })).toBeInTheDocument();
  });

  it('approves a single request and updates group sizes', async () => {
    open('/admin/transfers');
    const before = await sizeOf(6);
    const c = await card('Test003 Student');
    fireEvent.click(within(c).getByRole('button', { name: 'Approve → Group 6' }));
    const dialog = await screen.findByRole('dialog', { name: 'Approve → Group 6' });
    expect(within(dialog).getByRole('group', { name: /Before and after/ })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await sizeOf(6)).toBe(before + 1);
    expect(screen.queryByRole('article', { name: 'Request from Test003 Student' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Approved 1' }));
    expect(screen.getByText(/Moved to Group 6/)).toBeInTheDocument();
  });

  it('approves into another group chosen from the select', async () => {
    open('/admin/transfers');
    const c = await card('Test003 Student');
    fireEvent.change(within(c).getByLabelText('Other group for Test003 Student'), { target: { value: '5' } });
    expect(await screen.findByRole('dialog', { name: 'Approve → Group 5' })).toBeInTheDocument();
  });

  it('rejects with a note and shows it in history', async () => {
    open('/admin/transfers');
    const c = await card('Test003 Student');
    fireEvent.click(within(c).getByRole('button', { name: 'Reject' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reject request' });
    expect(within(dialog).getByLabelText(/Note/)).toHaveAttribute('maxlength', '500');
    fireEvent.change(within(dialog).getByLabelText(/Note/), { target: { value: 'Not this week.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Rejected 2' }));
    expect(screen.getByText('Note: Not this week.')).toBeInTheDocument();
    expect(screen.getByText('Note: Groups are full this week.')).toBeInTheDocument();
  });

  it('toggles the open/closed switch', async () => {
    open('/admin/transfers');
    const sw = await screen.findByRole('switch', { name: /Transfer requests: Open/ });
    expect(sw).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(sw);
    await waitFor(() => expect(screen.getByRole('switch', { name: /Transfer requests: Closed/ })).toHaveAttribute('aria-checked', 'false'));
  });
});
