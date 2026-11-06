import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from '../routes';

function renderAt(path: string) {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
}

describe('Layout and routes', () => {
  it('renders header and home', () => {
    renderAt('/');
    expect(screen.getByRole('banner')).toHaveTextContent('NIBM iOS');
    expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument();
  });
  it('renders /lms', () => {
    renderAt('/lms');
    expect(screen.getByRole('heading', { name: 'LMS' })).toBeInTheDocument();
  });
  it('renders NotFound for unknown paths', () => {
    renderAt('/nope');
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});
