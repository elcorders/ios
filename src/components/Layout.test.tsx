import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { api } from '../api';
import { resetMockAuth } from '../api/mock/auth';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from '../routes';
import { pageWidth } from './Layout';

function renderAt(path: string) {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
}

describe('Layout and routes', () => {
  it('renders header and redirects signed-out users from home to sign in', async () => {
    renderAt('/');
    expect(screen.getByRole('banner')).toHaveTextContent('NIBM iOS');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });
  it('renders /lms', async () => {
    renderAt('/lms');
    expect(await screen.findByRole('heading', { name: 'LMS link problem' })).toBeInTheDocument();
  });
  it('renders NotFound for unknown paths', () => {
    renderAt('/nope');
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
  it('picks a page width by route', () => {
    expect(pageWidth('/')).toBe('wide');
    expect(pageWidth('/lab')).toBe('wide');
    expect(pageWidth('/admin/members')).toBe('wide');
    expect(pageWidth('/notifications')).toBe('reading');
    expect(pageWidth('/login')).toBe('narrow');
    expect(pageWidth('/labx')).toBe('narrow');
  });
});

describe('Account menu', () => {
  beforeEach(() => resetMockAuth());

  it('is hidden when signed out', async () => {
    renderAt('/login');
    await screen.findByRole('heading', { name: 'Sign in' });
    expect(screen.queryByRole('button', { name: 'Account' })).toBeNull();
  });

  it('opens with identity, links and Sign out; Escape closes it', async () => {
    await api.verifyEmailCode('student005@example.edu', '123456');
    renderAt('/');
    const btn = await screen.findByRole('button', { name: 'Account' });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('student005@example.edu')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Request a group change' })).toHaveAttribute('href', '/transfer');
    expect(screen.getByRole('link', { name: 'Install the app' })).toHaveAttribute('href', '/install');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
    expect(btn).toHaveFocus();
  });

  it('closes on outside click and signs out', async () => {
    await api.verifyEmailCode('student005@example.edu', '123456');
    renderAt('/');
    const btn = await screen.findByRole('button', { name: 'Account' });
    fireEvent.click(btn);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
    fireEvent.click(btn);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });
});
