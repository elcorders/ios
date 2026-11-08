import type { MyEnrolment } from '../api/types';

/** Class WhatsApp group card, one per active student enrolment that has a link. */
export function WhatsAppCard({ enrolments }: { enrolments: MyEnrolment[] }) {
  const items = enrolments.filter((e) => e.role === 'student' && e.status === 'active' && e.whatsapp_link);
  if (items.length === 0) return null;
  return (
    <>
      {items.map((e) => (
        <div key={e.enrolment_id} className="card whatsapp-card" aria-label={`WhatsApp group ${e.cohort_code}`}>
          <h2>Join the class WhatsApp group</h2>
          <p>Class {e.cohort_code}</p>
          <p>
            <a href={e.whatsapp_link!} target="_blank" rel="noopener noreferrer" className="button">
              Join the WhatsApp group
            </a>
          </p>
          <p>Fuzail approves join requests manually, so it may take a little while.</p>
        </div>
      ))}
    </>
  );
}
