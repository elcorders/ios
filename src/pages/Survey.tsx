import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { SurveySubmitResult } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { surveyCohort } from '../auth/RequireAuth';
import { messageFor } from '../lib/errors';

const SURVEY_MESSAGES: Record<string, string> = {
  forbidden: 'You are not an active student in this class, so you cannot answer this. Ask Fuzail.',
  cohort_archived: 'This class has been archived, so the survey is closed.',
  invalid_input: 'Please choose Yes or No.',
};

function errorText(error: { code: string }): string {
  return SURVEY_MESSAGES[error.code] ?? messageFor(error);
}

/** Survey gate (S2.F1): one question, answered once. The backend assigns the group. */
export function Survey() {
  const { me, refresh } = useAuth();
  const navigate = useNavigate();
  const [choice, setChoice] = useState<boolean | null>(null);
  const [result, setResult] = useState<SurveySubmitResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!me) return null;
  const target = surveyCohort(me);
  // Nothing to answer (and not just finished): go home.
  if (!target && !result) return <Navigate to="/" replace />;

  async function submit() {
    if (choice === null || !target) return;
    setBusy(true);
    setError(null);
    const res = await api.submitSurvey(target.cohort_id, choice);
    setBusy(false);
    if (res.ok) setResult(res.data);
    else setError(errorText(res.error));
  }

  async function finish() {
    await refresh();
    navigate('/', { replace: true });
  }

  if (result) {
    return (
      <section className="card stack">
        <h1>Thank you</h1>
        <p>You're in <strong>{result.group_name}</strong>.</p>
        <button type="button" className="primary" onClick={() => void finish()}>Continue</button>
      </section>
    );
  }

  return (
    <section className="card stack">
      <h1>Quick question</h1>
      {choice === null ? (
        <>
          <p>Do you have access to a Mac now?</p>
          <button type="button" className="primary" onClick={() => setChoice(true)}>Yes</button>
          <button type="button" className="primary" onClick={() => setChoice(false)}>No</button>
        </>
      ) : (
        <>
          <p>
            You answered <strong>{choice ? 'Yes' : 'No'}</strong> to "Do you have access to a Mac now?". You can't
            change this yourself; ask Fuzail later.
          </p>
          <button type="button" className="primary" disabled={busy} onClick={() => void submit()}>Confirm</button>
          <button type="button" disabled={busy} onClick={() => { setChoice(null); setError(null); }}>Go back</button>
        </>
      )}
      {error && <p role="alert" className="error">{error}</p>}
    </section>
  );
}
