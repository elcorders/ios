import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from '../routes';
import { api } from '../api';
import { resetMockAuth } from '../api/mock/auth';
import { resetMockContent } from '../api/mock/content';

function open(path: string) {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
}

beforeEach(async () => {
  resetMockAuth();
  resetMockContent();
  await api.verifyEmailCode('student001@example.edu', '123456');
});

describe('content pages', () => {
  it('lists resources', async () => {
    open('/resources');
    expect(await screen.findByRole('heading', { name: 'Resources' })).toBeInTheDocument();
    expect(await screen.findByText('Lab Mac setup')).toBeInTheDocument();
    expect(screen.queryByText('Swift cheat sheet')).toBeNull();
  });
  it('lists only visible tutorials', async () => {
    open('/tutorials');
    expect(await screen.findByText('Tutorial 1 — Demo game')).toBeInTheDocument();
    expect(screen.queryByText(/Tutorial 2/)).toBeNull();
    expect(screen.queryByText(/Tutorial 3/)).toBeNull();
  });
  it('shows the viewer in a sandboxed frame', async () => {
    open('/c/content-t1');
    expect(await screen.findByRole('heading', { name: 'Tutorial 1 — Demo game' })).toBeInTheDocument();
    const f = screen.getByTitle('Tutorial 1 — Demo game');
    expect(f.getAttribute('sandbox')).not.toContain('allow-same-origin');
    expect(screen.getByRole('link', { name: /Back to Tutorials/ })).toBeInTheDocument();
  });
  it('shows a friendly message for unavailable items', async () => {
    open('/c/content-t2');
    expect(await screen.findByRole('heading', { name: 'Not available yet' })).toBeInTheDocument();
  });
  it('home has quick links and nav has content links', async () => {
    open('/');
    await screen.findByRole('heading', { name: 'Home' });
    expect(screen.getAllByRole('link', { name: /Resources/ }).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByRole('link', { name: /Tutorials/ }).length).toBeGreaterThanOrEqual(2);
  });
});
