import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from '../../routes';
import { notImplemented } from '../../api/stub';

const renderAt = (path: string) => render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);

describe('S21 kiosk routes', () => {
  it('/kiosk is full screen, outside the app layout', () => {
    renderAt('/kiosk');
    expect(screen.getByRole('heading', { name: 'Lab kiosk' })).toBeInTheDocument();
    expect(screen.queryByRole('banner')).toBeNull();
  });
  it('/kiosk/c/:id uses the kiosk shell too', () => {
    renderAt('/kiosk/c/00000000-0000-0000-0000-000000000001');
    expect(screen.queryByRole('banner')).toBeNull();
  });
  it('/kiosk/pair needs a signed-in person', async () => {
    renderAt('/kiosk/pair?c=ABCD2345');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });
  it('S21 methods are stubbed until F / I', async () => {
    const r = await notImplemented('mock').kioskFeed();
    expect(r.ok).toBe(false);
  });
});
