import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from '../routes';
import { api } from '../api';
import { resetMockAuth } from '../api/mock/auth';
import { MOCK_COHORT } from '../api/mock/fixtures/s1';

function open() {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/'] })} />);
}

beforeEach(() => resetMockAuth());

describe('Home lab card', () => {
  it('shows for a student while the lab is open', async () => {
    await api.verifyEmailCode('student005@example.edu', '123456');
    open();
    expect(await screen.findByRole('link', { name: /Lab booking/ })).toBeInTheDocument();
  });

  it('hides for a student while the lab is closed, but stays for an admin', async () => {
    await api.verifyEmailCode('admin@example.edu', '123456');
    await api.adminUpdateCohortSettings(MOCK_COHORT.id, { lab_open: false });
    await api.verifyEmailCode('student005@example.edu', '123456');
    open();
    await screen.findByRole('link', { name: /Guides and references/ });
    expect(screen.queryByRole('link', { name: /Lab booking/ })).toBeNull();
  });

  it('shows for an admin', async () => {
    await api.verifyEmailCode('admin@example.edu', '123456');
    open();
    expect(await screen.findByRole('link', { name: /Lab booking/ })).toBeInTheDocument();
  });
});
