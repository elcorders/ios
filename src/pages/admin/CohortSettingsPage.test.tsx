import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from '../../routes';
import { api } from '../../api';
import { resetMockAuth } from '../../api/mock/auth';
import { resetMockAdmin } from '../../api/mock/admin';
import { parseWhatsAppLink } from './CohortSettingsPage';
import { WhatsAppCard } from '../../components/WhatsAppCard';
import type { MyEnrolment } from '../../api/types';

beforeEach(() => {
  resetMockAuth();
  resetMockAdmin();
  localStorage.clear();
});

const enrol = (over: Partial<MyEnrolment>): MyEnrolment => ({
  enrolment_id: 'e1', cohort_id: 'c1', cohort_code: '25.2', cohort_status: 'active',
  role: 'student', status: 'active', whatsapp_link: 'https://chat.whatsapp.com/abc',
  survey_done: true, group_no: null, group_name: null, lab_open: false, ...over,
});

describe('parseWhatsAppLink', () => {
  it('maps empty to null, accepts invite links, rejects others', () => {
    expect(parseWhatsAppLink('  ')).toEqual({ ok: true, value: null });
    expect(parseWhatsAppLink('https://chat.whatsapp.com/abc')).toEqual({ ok: true, value: 'https://chat.whatsapp.com/abc' });
    expect(parseWhatsAppLink('https://example.com/x')).toEqual({ ok: false });
    expect(parseWhatsAppLink('https://chat.whatsapp.com/')).toEqual({ ok: false });
  });
});

describe('WhatsAppCard', () => {
  it('shows a safe external link for student enrolments with a link', () => {
    render(<WhatsAppCard enrolments={[enrol({})]} />);
    expect(screen.getByText('Join the class WhatsApp group')).toBeInTheDocument();
    expect(screen.getByText(/25\.2/)).toBeInTheDocument();
    const a = screen.getByRole('link');
    expect(a).toHaveAttribute('target', '_blank');
    expect(a).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText(/approves join requests manually/)).toBeInTheDocument();
  });
  it('renders nothing without link, for non-students, or inactive', () => {
    const { container } = render(
      <WhatsAppCard enrolments={[enrol({ whatsapp_link: null }), enrol({ role: 'instructor' as never }), enrol({ status: 'removed' as never })]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('CohortSettingsPage', () => {
  async function openPage() {
    await api.verifyEmailCode('admin@example.edu', '123456');
    render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/admin/cohort'] })} />);
    return screen.findByLabelText('WhatsApp group link');
  }

  it('shows cohort details and validates before saving', async () => {
    const input = await openPage();
    expect(screen.getByText('BSCCOMP25.2P')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'https://example.com/x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/must start with/);
  });

  it('saves a valid link and clears it with an empty value', async () => {
    const input = await openPage();
    fireEvent.change(input, { target: { value: 'https://chat.whatsapp.com/abc123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Saved.');
    const list = await api.adminListCohorts();
    if (list.ok) expect(list.data.find((c) => c.code === '25.2')?.settings.whatsapp_link).toBe('https://chat.whatsapp.com/abc123');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(async () => {
      const l = await api.adminListCohorts();
      expect(l.ok && l.data.find((c) => c.code === '25.2')?.settings.whatsapp_link).toBeNull();
    });
  });

  it('is disabled for an archived cohort', async () => {
    localStorage.setItem('ios.admin.cohort', '00000000-0000-4000-8000-000000000251');
    const input = await openPage();
    expect(input).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});

describe('mock getMe whatsapp_link', () => {
  it('reflects the shared cohort state', async () => {
    const { setMockCohortWhatsApp } = await import('../../api/mock/cohortState');
    await api.verifyEmailCode('student001@example.edu', '123456');
    setMockCohortWhatsApp('00000000-0000-4000-8000-000000000252', 'https://chat.whatsapp.com/zzz');
    const me = await api.getMe();
    expect(me.ok && me.data.enrolments[0]?.whatsapp_link).toBe('https://chat.whatsapp.com/zzz');
  });
});
