import type { ClassSession, ClassTemplate } from '../../../api/types';
import { BellIcon } from '../../../components/BellIcon';
import { formatColombo } from '../../../lib/time';
import { labText, notifyText, openText } from './classesHelpers';

const longDate = (iso: string) => formatColombo(iso, { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' });

interface Props {
  session: ClassSession;
  templates: ClassTemplate[];
  readOnly: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

/** One class day: date, title, template, lab block, slots with their groups and items. */
export function SessionCard({ session: s, templates, readOnly, onEdit, onDuplicate, onDelete }: Props) {
  const template = s.template_id ? templates.find((t) => t.id === s.template_id) : null;
  const tag = `${s.title} ${s.date}`;
  return (
    <li className="class-item" aria-label={s.title}>
      <div className="class-card-head">
        <span className="class-when">{longDate(s.starts_at)}</span>
        {template ? <span className="badge">{template.name}</span> : null}
      </div>
      <h3>{s.title}</h3>
      <ul className="class-slots" aria-label="Time slots">
        {s.slots.map((x, i) => (
          <li key={x.id} className="class-slot">
            <div className="slot-line">
              <strong>{x.label ?? `Slot ${i + 1}`}</strong>
              <span className="slot-time">{x.start_time}–{x.end_time}</span>
              <span className="slot-groups-text">{x.group_nos.map((g) => `G${g}`).join(', ')}</span>
            </div>
            {x.content.length > 0 ? (
              <ul className="slot-content" aria-label={`Items in ${x.label ?? `Slot ${i + 1}`}`}>
                {x.content.map((c) => (
                  <li key={c.id}>
                    <span className="slot-item-title">{c.title}</span>
                    <span className="muted"> · {c.kind}</span>
                    <span className="badge status-on_session">{openText(x)}</span>
                    <span className="notify-text"><BellIcon size={13} /> {notifyText(c, x.end_time)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="class-meta">
        <span>{s.deliverables.length} deliverable{s.deliverables.length === 1 ? '' : 's'}</span>
        <span>{labText(s.lab_block_until)}</span>
      </div>
      {!readOnly ? (
        <div className="class-actions">
          <button type="button" aria-label={`Edit ${tag}`} onClick={onEdit}>Edit</button>
          <button type="button" aria-label={`Duplicate ${tag}`} onClick={onDuplicate}>Duplicate</button>
          <button type="button" aria-label={`Delete ${tag}`} onClick={onDelete}>Delete</button>
        </div>
      ) : null}
    </li>
  );
}
