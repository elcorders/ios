import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
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
