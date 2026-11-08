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

async function menuItem(email: string, item: string) {
  fireEvent.click(await screen.findByRole('button', { name: `Actions for ${email}` }));
  fireEvent.click(screen.getByRole('menuitem', { name: `${item} ${email}` }));
}

beforeEach(async () => {
  resetMockAuth();
  resetMockAdmin();
  localStorage.clear();
  await api.verifyEmailCode('admin@example.edu', '123456');
});

describe('PendingPage', () => {
  it('filters with counts', async () => {
    open('/admin/pending');
    await screen.findByText('student061@example.edu');
    expect(screen.getByRole('button', { name: 'Pending 2' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Decided 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discarded 0' })).toBeInTheDocument();
    expect(screen.queryByText('student063@example.edu')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Decided 1' }));
    expect(screen.getByText('student063@example.edu')).toBeInTheDocument();
    expect(screen.queryByText('student061@example.edu')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'All 3' }));
    expect(screen.getAllByRole('row')).toHaveLength(4);
  });

  it('sorts by email', async () => {
    open('/admin/pending');
    await screen.findByText('student061@example.edu');
    const th = screen.getByRole('columnheader', { name: /^Email/ });
    fireEvent.click(within(th).getByRole('button'));
    expect(th).toHaveAttribute('aria-sort', 'ascending');
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('student061@example.edu');
    fireEvent.click(within(th).getByRole('button'));
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('student062@example.edu');
  });

  it('discards a pending row and restores it', async () => {
    open('/admin/pending');
    await menuItem('student061@example.edu', 'Discard');
    expect(screen.getByRole('dialog')).toHaveTextContent(/hidden everywhere/);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Discard' }));
    await screen.findByRole('button', { name: 'Discarded 1' });
    expect(screen.queryByText('student061@example.edu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pending 1' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Discarded 1' }));
    await menuItem('student061@example.edu', 'Restore');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Restore' }));
    await screen.findByRole('button', { name: 'Discarded 0' });
    expect(screen.getByRole('button', { name: 'Pending 2' })).toBeInTheDocument();
  });

  it('can discard a rejected row', async () => {
    open('/admin/pending');
    fireEvent.click(await screen.findByRole('button', { name: 'Decided 1' }));
    await menuItem('student063@example.edu', 'Discard');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Discard' }));
    await screen.findByRole('button', { name: 'Discarded 1' });
  });

  it('bulk approves selected pending rows', async () => {
    open('/admin/pending');
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select all pending shown' }));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('region', { name: 'Bulk actions' })).getByRole('button', { name: 'Approve' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Approve' }));
    expect(await screen.findByText(/2 succeeded/)).toBeInTheDocument();
    await screen.findByRole('button', { name: 'Pending 0' });
  });
});
