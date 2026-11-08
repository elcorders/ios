import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import './table.css';

export interface RowMenuItem {
  label: string;
  /** Accessible name; defaults to the label. */
  ariaLabel?: string;
  onSelect: () => void;
  danger?: boolean;
}

/** "⋯" button with a keyboard-accessible popup menu (Esc closes, click outside closes). */
export function RowMenu({ label, items }: { label: string; items: RowMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  /** Keep the fixed-position menu under its button. Returns false when the button left the viewport. */
  const place = (): boolean => {
    const r = trigger.current?.getBoundingClientRect();
    if (!r) return false;
    setPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
    return r.bottom > 0 && r.top < window.innerHeight;
  };
  const openMenu = () => {
    place();
    setOpen(true);
  };
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !trigger.current?.contains(t)) setOpen(false);
    };
    const onAway = () => setOpen(false);
    // Scrolling (incl. the browser scrolling the button into view on click) moves the menu with
    // its button instead of closing it; it closes only once the button is off screen.
    const onScroll = (e: Event) => {
      if (menu.current?.contains(e.target as Node)) return;
      if (!place()) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('resize', onAway);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('resize', onAway);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const onMenuKey = (e: KeyboardEvent) => {
    const els = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const i = els.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      els[(i + 1) % els.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      els[(i - 1 + els.length) % els.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      els[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      els[els.length - 1]?.focus();
    } else if (e.key === 'Tab') {
      close(false);
    }
  };

  const onTriggerKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      openMenu();
    }
  };

  return (
    <>
      <button ref={trigger} type="button" className="menu-btn" aria-label={label} aria-haspopup="menu"
        aria-expanded={open} onClick={() => (open ? close(false) : openMenu())} onKeyDown={onTriggerKey}>
        <span aria-hidden="true">⋯</span>
      </button>
      {open ? (
        <div ref={menu} role="menu" aria-label={label} className="row-menu" style={{ top: pos.top, right: pos.right }}
          onKeyDown={onMenuKey}>
          {items.map((it) => (
            <button key={it.label} type="button" role="menuitem" tabIndex={-1}
              className={it.danger ? 'menu-item danger' : 'menu-item'} aria-label={it.ariaLabel}
              onClick={() => { close(true); it.onSelect(); }}>
              {it.label}
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}
