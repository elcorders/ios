import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Me } from '../api/types';
import { RequireAuth } from './RequireAuth';

let me: Me;
vi.mock('./AuthProvider', () => ({ useAuth: () => ({ me, loading: false }) }));

function meWith(setup: boolean, surveyDone: boolean, isAdmin = false): Me {
  return {
    profile: {} as Me['profile'], is_admin: isAdmin,
    enrolments: [{
      enrolment_id: 'e1', cohort_id: 'c1', cohort_code: '25.2', cohort_status: 'active', role: 'student',
      status: 'active', whatsapp_link: null, survey_done: surveyDone, group_no: null, group_name: null,
    }],
    security: { passkeys: setup ? 1 : 0, totp: false, setup_complete: setup },
  };
}

function at(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        {['/', '/setup', '/survey'].map((p) => (
          <Route key={p} path={p} element={<RequireAuth><p>page {p}</p></RequireAuth>} />
        ))}
      </Routes>
    </MemoryRouter>,
  );
}

describe('RequireAuth gate order', () => {
  it('security setup comes before the survey', () => {
    me = meWith(false, false);
    at('/setup');
    expect(screen.getByText('page /setup')).toBeInTheDocument();
  });
  it('/survey without setup goes to /setup', () => {
    me = meWith(false, false);
    at('/survey');
    expect(screen.getByText('page /setup')).toBeInTheDocument();
  });
  it('after setup, an unanswered student goes to /survey', () => {
    me = meWith(true, false);
    at('/');
    expect(screen.getByText('page /survey')).toBeInTheDocument();
  });
  it('an admin with an unanswered student enrolment is not gated', () => {
    me = meWith(true, false, true);
    at('/');
    expect(screen.getByText('page /')).toBeInTheDocument();
  });
});
