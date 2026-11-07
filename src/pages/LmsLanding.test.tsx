import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from '../routes';
import { resetMockAuth } from '../api/mock/auth';
import { api } from '../api';
import { PREFILL_KEY, resetLmsCapture } from './LmsLanding';

function open(query: string) {
  window.history.replaceState(null, '', `/#/lms${query}`);
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/lms'] })} />);
}

const GOOD = 'k=dev-key-25-2&course=12345';

beforeEach(() => {
  resetMockAuth();
  resetLmsCapture();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('LmsLanding', () => {
  it('clears params from the URL and shows roster step', async () => {
    open(`?${GOOD}&email=student001@example.edu&idnumber=COBSCCOMP251P-001&first=Test&last=Student`);
    expect(window.location.hash).toBe('#/lms');
    expect(window.location.href).not.toContain('student001');
    expect(await screen.findByRole('heading', { name: /class 25\.2/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('student001@example.edu');
    expect(screen.getByLabelText('Email')).toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: 'Send code' })).toBeInTheDocument();
  });

  it('shows pending screen for unknown student', async () => {
    open(`?${GOOD}&email=nobody@example.edu&idnumber=X-1`);
    expect(await screen.findByText(/Fuzail will check/)).toBeInTheDocument();
  });

  it.each([
    ['k=wrong&course=12345&email=a@example.edu', /not valid any more/],
    [`${GOOD}`, /missing from the link/],
    ['', /not valid any more/],
  ])('maps errors for %j', async (q, re) => {
    open(q ? `?${q}` : '');
    expect(await screen.findByRole('alert')).toHaveTextContent(re);
  });

  it('stores normalised phone prefill (mobile, else phone)', async () => {
    open(`?${GOOD}&email=student001@example.edu&phone=0771234567`);
    await screen.findByRole('heading', { name: /class 25\.2/ });
    expect(JSON.parse(sessionStorage.getItem(PREFILL_KEY)!)).toEqual({ phone: '+94771234567' });
    resetLmsCapture();
    open(`?${GOOD}&email=student001@example.edu&mobile=0712345678&phone=0771234567`);
    expect(JSON.parse(sessionStorage.getItem(PREFILL_KEY)!)).toEqual({ phone: '+94712345678' });
  });

  it('already signed in: skips the landing check and the email code, goes Home', async () => {
    await api.verifyEmailCode('student001@example.edu', '123456');
    const spy = vi.spyOn(api, 'lmsLanding');
    open(`?${GOOD}&email=student001@example.edu&idnumber=COBSCCOMP251P-001`);
    expect(await screen.findByText(/Signed in as/)).toBeInTheDocument();
    expect(window.location.href).not.toContain('student001');
    expect(spy).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Send code' })).not.toBeInTheDocument();
    spy.mockRestore();
  });

  it('signed out returning student can use a passkey from the LMS page (no email sent)', async () => {
    const send = vi.spyOn(api, 'sendEmailCode');
    open(`?${GOOD}&email=student001@example.edu&idnumber=COBSCCOMP251P-001`);
    const passkey = await screen.findByRole('button', { name: 'Sign in with passkey' });
    expect(screen.getByRole('link', { name: /authenticator app/ })).toBeInTheDocument();
    fireEvent.click(passkey);
    expect(await screen.findByText(/Signed in as/)).toBeInTheDocument();
    expect(send).not.toHaveBeenCalled();
    send.mockRestore();
  });
});
