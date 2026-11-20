import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from '../../routes';
import { api } from '../../api';
import { resetMockAuth } from '../../api/mock/auth';
import { resetMockAdmin } from '../../api/mock/admin';
import { resetMockKiosk } from '../../api/mock/kiosk';
import { MOCK_COHORT } from '../../api/mock/fixtures/s1';

function open(path = '/admin/kiosks') {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
}

beforeEach(() => {
  resetMockAuth();
  resetMockAdmin();
  resetMockKiosk();
  localStorage.clear();
});

describe('Admin > Kiosks', () => {
  beforeEach(async () => {
    await api.verifyEmailCode('admin@example.edu', '123456');
  });

  it('lists devices with online status and a pairing link', async () => {
    open();
    const lab = (await screen.findByText('Lab 1 wall screen')).closest('li')!;
    expect(within(lab).getByText('Online')).toBeInTheDocument();
    const staff = screen.getByText('Staff room PC').closest('li')!;
    expect(within(staff).getByText(/^Last seen /)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pair a new screen' })).toHaveAttribute('href', '/kiosk/pair');
    expect(screen.getByRole('link', { name: 'Kiosks' })).toBeInTheDocument();
  });

  it('renames a kiosk and sets a cohort override', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Lab 1 wall screen' }));
    const dlg = screen.getByRole('dialog');
    fireEvent.change(within(dlg).getByLabelText('Name'), { target: { value: 'Lab 1 front' } });
    fireEvent.change(within(dlg).getByLabelText('Cohort override'), { target: { value: MOCK_COHORT.id } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    const item = (await screen.findByText('Lab 1 front')).closest('li')!;
    expect(within(item).getByText(new RegExp(`Cohort: ${MOCK_COHORT.code.replace('.', '\\.')}`))).toBeInTheDocument();
  });

  it('shows a conflict when the name is taken', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Lab 1 wall screen' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Staff room PC' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }));
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toBeInTheDocument();
  });

  it('revokes only after confirming', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke Staff room PC' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Revoke Staff room PC' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Revoke Staff room PC' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Revoke' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Revoke Staff room PC' })).not.toBeInTheDocument());
    expect(screen.getByText(/^Revoked /)).toBeInTheDocument();
  });

  it('deletes a revoked kiosk after confirming; live kiosks have no Delete', async () => {
    open();
    expect(await screen.findByRole('button', { name: 'Revoke Staff room PC' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete Staff room PC' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Revoke Staff room PC' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Revoke' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Staff room PC' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Staff room PC deleted.')).toBeInTheDocument();
    expect(screen.queryByText('Staff room PC')).not.toBeInTheDocument();
  });

  it('sets the current cohort', async () => {
    open();
    const sel = await screen.findByLabelText('Current cohort');
    fireEvent.change(sel, { target: { value: '' } });
    await screen.findByText('Current cohort saved.');
    const res = await api.adminListKiosks();
    expect(res.ok && res.data.current_cohort_id).toBeNull();
  });

  it('shows a newly approved pairing in the list', async () => {
    await api.kioskPairApprove('ABCD2345', 'Lab 3 TV');
    open();
    expect(await screen.findByText('Lab 3 TV')).toBeInTheDocument();
  });
});

describe('Admin > Kiosks role gating', () => {
  it('is not available to an instructor', async () => {
    await api.verifyEmailCode('instructor001@example.edu', '123456');
    open();
    expect(await screen.findByText('Not allowed')).toBeInTheDocument();
    expect(screen.queryByText('Lab 1 wall screen')).not.toBeInTheDocument();
  });

  it('the API refuses non-admins', async () => {
    await api.verifyEmailCode('instructor001@example.edu', '123456');
    const res = await api.adminListKiosks();
    expect(!res.ok && res.error.code).toBe('forbidden');
  });
});
