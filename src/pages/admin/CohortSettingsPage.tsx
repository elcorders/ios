import { useState, type FormEvent } from 'react';
import { api } from '../../api';
import { messageFor } from '../../lib/errors';
import { useAdmin } from './AdminContext';

export const WHATSAPP_PREFIX = 'https://chat.whatsapp.com/';

/** Empty input becomes null; otherwise the link must be a WhatsApp invite. */
export function parseWhatsAppLink(input: string): { ok: true; value: string | null } | { ok: false } {
  const v = input.trim();
  if (!v) return { ok: true, value: null };
  return v.startsWith(WHATSAPP_PREFIX) && v.length > WHATSAPP_PREFIX.length ? { ok: true, value: v } : { ok: false };
}

/** Cohort settings (S1.F4: WhatsApp group link). */
export function CohortSettingsPage() {
  const { cohort } = useAdmin();
  return <CohortSettingsForm key={cohort.id} />;
}

function CohortSettingsForm() {
  const { cohort, readOnly, reloadCohorts } = useAdmin();
  const [link, setLink] = useState(cohort.settings.whatsapp_link ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    const parsed = parseWhatsAppLink(link);
    if (!parsed.ok) {
      setError(`The link must start with ${WHATSAPP_PREFIX}`);
      return;
    }
    setError(null);
    setBusy(true);
    const res = await api.adminUpdateCohortSettings(cohort.id, { whatsapp_link: parsed.value });
    setBusy(false);
    if (!res.ok) {
      setError(messageFor(res.error));
      return;
    }
    setLink(res.data.whatsapp_link ?? '');
    setSaved(true);
    await reloadCohorts();
  }

  return (
    <section className="card">
      <h2>Cohort settings</h2>
      <dl>
        <dt>Code</dt><dd>{cohort.code}</dd>
        <dt>Batch</dt><dd>{cohort.batch}</dd>
        <dt>LMS course id</dt><dd>{cohort.lms_course_id}</dd>
        <dt>Status</dt><dd>{cohort.status}</dd>
      </dl>
      <form onSubmit={save} noValidate>
        <label htmlFor="whatsapp-link">WhatsApp group link</label>
        <input
          id="whatsapp-link"
          type="url"
          value={link}
          disabled={readOnly || busy}
          placeholder={`${WHATSAPP_PREFIX}...`}
          onChange={(e) => setLink(e.target.value)}
        />
        <button type="submit" disabled={readOnly || busy}>Save</button>
        {readOnly && <p>This cohort is archived and read-only.</p>}
        {error && <p role="alert">{error}</p>}
        {saved && <p role="status">Saved.</p>}
      </form>
    </section>
  );
}
