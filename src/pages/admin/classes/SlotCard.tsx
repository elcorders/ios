import { useState } from 'react';
import type { AdminContentRow, SlotNotify } from '../../../api/types';
import { atValue, NOTIFY_LABELS, slotName, type ItemDraft, type SlotDraft } from './classesHelpers';

interface Props {
  index: number;
  slot: SlotDraft;
  date: string;
  /** Group numbers of the cohort. */
  groups: number[];
  /** Groups used by the other slots (disabled here). */
  takenGroups: Set<number>;
  content: AdminContentRow[];
  canRemove: boolean;
  onChange: (patch: Partial<SlotDraft>) => void;
  onRemove: () => void;
}

const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

/** One slot of a class day: label, times, group chips and the tutorials / materials that open at its start. */
export function SlotCard({ index, slot, date, groups, takenGroups, content, canRemove, onChange, onRemove }: Props) {
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const name = slotName(slot, index);
  const byId = new Map(content.map((c) => [c.id, c]));
  const q = query.trim().toLowerCase();
  const matches = content.filter((c) => !q || c.title.toLowerCase().includes(q));

  const patchItem = (id: string, p: Partial<ItemDraft>) => onChange({ items: slot.items.map((x) => (x.id === id ? { ...x, ...p } : x)) });
  const toggleItem = (id: string) =>
    onChange({ items: slot.items.some((x) => x.id === id) ? slot.items.filter((x) => x.id !== id) : [...slot.items, { id, notify: 'slot_end', at: '' }] });

  const pickGroup = (kind: 'tutorial' | 'material', label: string) => {
    const rows = matches.filter((c) => c.kind === kind);
    if (rows.length === 0) return null;
    return (
      <fieldset className="pick-group">
        <legend>{label}</legend>
        {rows.map((c) => (
          <label key={c.id} className="pick-row">
            <input type="checkbox" checked={slot.items.some((x) => x.id === c.id)} onChange={() => toggleItem(c.id)} />
            <span>{c.title} <span className="muted">({c.status.replace('_', ' ')})</span></span>
          </label>
        ))}
      </fieldset>
    );
  };

  return (
    <fieldset className="slot-card" aria-label={`Slot ${index + 1}`}>
      <div className="slot-head">
        <strong>Slot {index + 1}</strong>
        {canRemove ? (
          <button type="button" className="slot-remove" aria-label={`Remove slot ${index + 1}`} onClick={onRemove}>Remove</button>
        ) : null}
      </div>
      <div className="slot-fields">
        <div className="field">
          <label htmlFor={`cl-label-${slot.key}`}>Label</label>
          <input id={`cl-label-${slot.key}`} value={slot.label} maxLength={40} onChange={(e) => onChange({ label: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor={`cl-start-${slot.key}`}>Start</label>
          <input id={`cl-start-${slot.key}`} type="time" value={slot.start} onChange={(e) => onChange({ start: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor={`cl-end-${slot.key}`}>End</label>
          <input id={`cl-end-${slot.key}`} type="time" value={slot.end} onChange={(e) => onChange({ end: e.target.value })} />
        </div>
      </div>
      <div className="slot-groups" role="group" aria-label={`Groups for ${name}`}>
        {groups.length === 0 ? <span className="muted">No groups yet. Set up groups first.</span> : null}
        {groups.map((g) => (
          <label key={g} className="chip">
            <input type="checkbox" checked={slot.groups.includes(g)} disabled={takenGroups.has(g)} onChange={() => onChange({ groups: toggle(slot.groups, g) })} />
            <span>G{g}</span>
          </label>
        ))}
      </div>
      <div className="slot-items">
        <p className="slot-items-title">Tutorials / materials that unlock at this slot</p>
        {slot.items.length === 0 ? <p className="muted">None.</p> : null}
        <ul className="item-list">
          {slot.items.map((it) => {
            const row = byId.get(it.id);
            const title = row?.title ?? 'Unknown item';
            return (
              <li key={it.id} className="item-row">
                <span className="item-title">{title} <span className="muted">· {row?.kind ?? 'item'}</span></span>
                <div className="item-notify">
                  <select
                    aria-label={`Notify for ${title} in ${name}`}
                    value={it.notify}
                    onChange={(e) => patchItem(it.id, { notify: e.target.value as SlotNotify })}
                  >
                    {(Object.keys(NOTIFY_LABELS) as SlotNotify[]).map((n) => <option key={n} value={n}>{NOTIFY_LABELS[n]}</option>)}
                  </select>
                  {it.notify === 'at' ? (
                    <input
                      type="datetime-local"
                      aria-label={`Notification time for ${title} in ${name}`}
                      value={atValue(date, slot, it)}
                      onChange={(e) => patchItem(it.id, { at: e.target.value })}
                    />
                  ) : null}
                  <button type="button" className="slot-remove" aria-label={`Remove ${title} from ${name}`} onClick={() => toggleItem(it.id)}>Remove</button>
                </div>
              </li>
            );
          })}
        </ul>
        {picking ? (
          <div className="picker">
            <input type="search" aria-label={`Search items for ${name}`} placeholder="Search tutorials and materials" value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="picker-list">
              {content.length === 0 ? <span className="muted">No tutorials or materials in this cohort yet.</span> : null}
              {content.length > 0 && matches.length === 0 ? <span className="muted">No match.</span> : null}
              {pickGroup('tutorial', 'Tutorials')}
              {pickGroup('material', 'Materials')}
            </div>
            <button type="button" className="slot-add" onClick={() => setPicking(false)}>Done</button>
          </div>
        ) : (
          <button type="button" className="slot-add" onClick={() => setPicking(true)}>+ Add tutorial / material</button>
        )}
      </div>
    </fieldset>
  );
}
