import type { BridgeDownCommand } from './kioskRemote';

/**
 * S23 bridge script ("kiosk-bridge.js", CONTRACT §S23 Bridge). It runs inside the sandboxed content iframe
 * (allow-scripts, no same-origin), so the parent can only talk to it through postMessage.
 * - Up: reports the person's own scroll / click / input / toggle (not replays) to the parent.
 * - Down: replays scroll / click / input / toggle / tap sent by the parent (only from `parent`, known ops only).
 *
 * `bridgeMain` is serialised with Function#toString into the srcdoc, so it must stay self-contained:
 * no imports, no outer variables, no helpers the compiler could inject.
 */
export function bridgeMain(win: Window): void {
  const doc = win.document;
  const PATH_RE = /^[A-Za-z0-9#_:().>\- ]+$/;
  const ID_RE = /^[A-Za-z][A-Za-z0-9_-]*$/;
  let replaying = false;
  let suppressScrollUntil = 0;
  let suppressToggleUntil = 0;
  const clamp = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
  const unit = (n: unknown): n is number => typeof n === 'number' && isFinite(n) && n >= 0 && n <= 1;
  const okPath = (p: unknown): p is string => typeof p === 'string' && p.length > 0 && p.length <= 500 && PATH_RE.test(p);
  const post = (m: Record<string, unknown>) => {
    m['type'] = 'ios-bridge';
    m['dir'] = 'up';
    win.parent.postMessage(m, '*');
  };

  function cssPath(el: Element): string | null {
    if (el === doc.body || el === doc.documentElement) return 'body';
    const parts: string[] = [];
    let cur: Element | null = el;
    while (cur && cur !== doc.body && cur !== doc.documentElement) {
      const id = cur.id;
      if (id && ID_RE.test(id) && doc.querySelectorAll('#' + id).length === 1) {
        parts.unshift('#' + id);
        break;
      }
      const tag = cur.tagName.toLowerCase();
      if (!/^[a-z][a-z0-9-]*$/.test(tag)) return null;
      let n = 1;
      let sib = cur.previousElementSibling;
      while (sib) {
        if (sib.tagName === cur.tagName) n++;
        sib = sib.previousElementSibling;
      }
      parts.unshift(tag + ':nth-of-type(' + n + ')');
      cur = cur.parentElement;
      if (cur === doc.body) parts.unshift('body');
    }
    const p = parts.join('>');
    return p.length <= 500 ? p : null;
  }
  function find(path: string): Element | null {
    try {
      return doc.querySelector(path);
    } catch {
      return null;
    }
  }
  const maxScroll = () => Math.max(0, (doc.scrollingElement || doc.documentElement).scrollHeight - win.innerHeight);

  function scrollState(): Record<string, unknown> {
    const max = maxScroll();
    const fraction = max > 0 ? clamp(win.scrollY / max) : 0;
    let anchor: string | null = null;
    let offset = 0;
    let el = doc.elementFromPoint ? doc.elementFromPoint(win.innerWidth / 2, 2) : null;
    while (el && el !== doc.body && el !== doc.documentElement) {
      const r = el.getBoundingClientRect();
      if (r.height >= 1 && r.top <= 2) {
        anchor = cssPath(el);
        offset = clamp(-r.top / r.height);
        break;
      }
      el = el.parentElement;
    }
    return { anchor, offset, fraction };
  }

  let lastScroll = 0;
  let scrollTimer: number | undefined;
  win.addEventListener('scroll', () => {
    if (Date.now() < suppressScrollUntil) return;
    const send = () => {
      lastScroll = Date.now();
      const m = scrollState();
      m['ev'] = 'scroll';
      post(m);
    };
    const wait = lastScroll + 50 - Date.now();
    if (wait <= 0) send();
    else if (scrollTimer === undefined) {
      scrollTimer = win.setTimeout(() => {
        scrollTimer = undefined;
        send();
      }, wait);
    }
  }, { passive: true });

  doc.addEventListener('click', (e) => {
    if (replaying || !e.isTrusted) return;
    const t = e.target as Element | null;
    if (!t || !t.getBoundingClientRect) return;
    const path = cssPath(t);
    if (!path) return;
    const r = t.getBoundingClientRect();
    post({ ev: 'click', path, x: r.width ? clamp((e.clientX - r.left) / r.width) : 0.5, y: r.height ? clamp((e.clientY - r.top) / r.height) : 0.5 });
  }, true);

  const onInput = (e: Event) => {
    if (replaying) return;
    const t = e.target as HTMLInputElement | null;
    if (!t || !t.tagName) return;
    const tag = t.tagName.toLowerCase();
    if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') return;
    if (tag === 'input' && (t.type === 'checkbox' || t.type === 'radio' || t.type === 'password' || t.type === 'file')) return;
    const path = cssPath(t);
    if (path) post({ ev: 'input', path, value: String(t.value).slice(0, 2000) });
  };
  doc.addEventListener('input', onInput, true);
  doc.addEventListener('change', onInput, true);

  doc.addEventListener('toggle', (e) => {
    if (replaying || Date.now() < suppressToggleUntil) return;
    const t = e.target as HTMLDetailsElement | null;
    if (!t || !t.tagName || t.tagName.toLowerCase() !== 'details') return;
    const path = cssPath(t);
    if (path) post({ ev: 'toggle', path, open: !!t.open });
  }, true);

  function replay(fn: () => void) {
    replaying = true;
    try {
      fn();
    } finally {
      replaying = false;
    }
  }

  win.addEventListener('message', (e) => {
    if (e.source !== win.parent) return;
    const d = e.data as Record<string, unknown> | null;
    if (!d || typeof d !== 'object' || d['type'] !== 'ios-bridge' || d['dir'] !== 'down') return;
    const op = d['op'];
    if (op === 'scroll') {
      if (!unit(d['offset']) || !unit(d['fraction'])) return;
      let y = (d['fraction'] as number) * maxScroll();
      const a = okPath(d['anchor']) ? find(d['anchor']) : null;
      if (a) {
        const r = a.getBoundingClientRect();
        y = win.scrollY + r.top + (d['offset'] as number) * r.height;
      }
      suppressScrollUntil = Date.now() + 400;
      win.scrollTo(0, Math.max(0, Math.round(y)));
    } else if (op === 'click') {
      if (!okPath(d['path'])) return;
      const el = find(d['path']) as HTMLElement | null;
      if (el && typeof el.click === 'function') replay(() => el.click());
    } else if (op === 'tap') {
      if (!unit(d['x']) || !unit(d['y'])) return;
      const el = doc.elementFromPoint((d['x'] as number) * win.innerWidth, (d['y'] as number) * win.innerHeight) as HTMLElement | null;
      if (el && typeof el.click === 'function') replay(() => el.click());
    } else if (op === 'input') {
      if (!okPath(d['path']) || typeof d['value'] !== 'string' || (d['value'] as string).length > 2000) return;
      const el = find(d['path']) as HTMLInputElement | null;
      if (!el || !('value' in el)) return;
      replay(() => {
        el.value = d['value'] as string;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
    } else if (op === 'toggle') {
      if (!okPath(d['path']) || typeof d['open'] !== 'boolean') return;
      const el = find(d['path']) as HTMLDetailsElement | null;
      if (!el || el.tagName.toLowerCase() !== 'details') return;
      suppressToggleUntil = Date.now() + 300;
      el.open = d['open'] as boolean;
    }
  });

  const ready = () => post({ ev: 'ready', w: win.innerWidth, h: win.innerHeight });
  if (doc.readyState === 'complete') ready();
  else win.addEventListener('load', ready);
}

export const BRIDGE_SCRIPT = `<script>(${bridgeMain.toString()})(window);</script>`;

/** Send a replay command into a bridged iframe. */
export function sendToBridge(frame: HTMLIFrameElement | null, cmd: BridgeDownCommand): void {
  const w = frame?.contentWindow;
  if (!w) return;
  const { type, ...rest } = cmd;
  w.postMessage({ type: 'ios-bridge', dir: 'down', op: type, ...rest }, '*');
}
