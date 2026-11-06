import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from '../routes';
import { resetMockAuth } from '../api/mock/auth';
import { api } from '../api';

function open(path: string) {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
}

async function signIn(email: string) {
  await api.verifyEmailCode(email, '123456');
}

beforeEach(() => resetMockAuth());
afterEach(() => {
  delete (window as unknown as Record<string, unknown>).PublicKeyCredential;
});

describe('security setup gate', () => {
  it('redirects an incomplete user from home to /setup', async () => {
    await signIn('student002@example.edu');
    open('/');
    expect(await screen.findByRole('heading', { name: 'Secure your account' })).toBeInTheDocument();
  });

  it('does not redirect a complete user, and /setup is reachable without looping', async () => {
    await signIn('student001@example.edu');
    open('/');
    expect(await screen.findByText(/Signed in as/)).toBeInTheDocument();
  });

  it('requires sign-in for /setup', async () => {
    open('/setup');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('passkey success goes home', async () => {
    (window as unknown as Record<string, unknown>).PublicKeyCredential = function () {};
    await signIn('student002@example.edu');
    open('/setup');
    fireEvent.click(await screen.findByRole('button', { name: 'Add a passkey' }));
    expect(await screen.findByText(/Signed in as/)).toHaveTextContent('student002@example.edu');
  });

  it('unsupported browser uses TOTP, then home', async () => {
    await signIn('student002@example.edu');
    open('/');
    expect(await screen.findByText(/Can't scan/)).toBeInTheDocument();
    expect(await screen.findByAltText(/QR code/)).toBeInTheDocument();
    const input = screen.getByLabelText('Authenticator code');
    fireEvent.change(input, { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify and finish' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/not correct/);
    fireEvent.change(input, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify and finish' }));
    expect(await screen.findByText(/Signed in as/)).toBeInTheDocument();
  });
});
