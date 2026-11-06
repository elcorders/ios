import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from '../routes';
import { resetMockAuth } from '../api/mock/auth';

function open(path: string) {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
}

beforeEach(() => resetMockAuth());

describe('Login', () => {
  it('passkey sign-in lands on home, then sign out returns to login', async () => {
    open('/login');
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in with passkey' }));
    expect(await screen.findByText(/Signed in as/)).toHaveTextContent('student001@example.edu');
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('email code flow', async () => {
    open('/login');
    fireEvent.click(await screen.findByRole('tab', { name: 'Email code' }));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'student002@example.edu' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }));
    const code = await screen.findByLabelText('6-digit code');
    fireEvent.change(code, { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify code' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/not correct/);
    fireEvent.change(code, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify code' }));
    // student002 has no passkey or authenticator yet, so the security gate applies.
    expect(await screen.findByRole('heading', { name: 'Secure your account' })).toBeInTheDocument();
  });

  it('email code for unknown email shows not-on-roster message', async () => {
    open('/login');
    fireEvent.click(await screen.findByRole('tab', { name: 'Email code' }));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'nobody@example.edu' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/not on a class list/);
  });

  it('authenticator app flow', async () => {
    open('/login');
    fireEvent.click(await screen.findByRole('tab', { name: 'Authenticator app' }));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'student003@example.edu' } });
    fireEvent.change(screen.getByLabelText('Authenticator code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText(/Signed in as/)).toHaveTextContent('student003@example.edu');
  });
});
