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
  // The page's main scroller: the document, or (for pages that scroll inside a box, e.g.
  // `main { height: 100vh; overflow: auto }`) the largest scrollable element.
  const docEl = (): Element => doc.scrollingElement || doc.documentElement;
  const canScroll = (el: Element) => el.scrollHeight - el.clientHeight > 1;
  let boxCache: Element | null = null;
  function scroller(): Element {
    if (docEl().scrollHeight - win.innerHeight > 1) return docEl();
    if (boxCache && boxCache.isConnected && canScroll(boxCache)) return boxCache;
    boxCache = null;
    let best = 0;
    const all = doc.body ? doc.body.getElementsByTagName('*') : [];
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      if (!el || !canScroll(el)) continue;
      const oy = win.getComputedStyle(el).overflowY;
      if (oy !== 'auto' && oy !== 'scroll') continue;
      const r = el.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > best) {
        best = area;
        boxCache = el;
      }
    }
    return boxCache || docEl();
  }
  const isDoc = (el: Element) => el === docEl();
  const viewTop = (el: Element) => (isDoc(el) ? 0 : el.getBoundingClientRect().top);
  const scrollTopOf = (el: Element) => (isDoc(el) ? win.scrollY : el.scrollTop);
  const maxOf = (el: Element) => Math.max(0, isDoc(el) ? el.scrollHeight - win.innerHeight : el.scrollHeight - el.clientHeight);
  function scrollToY(el: Element, y: number) {
    const top = Math.max(0, Math.round(y));
    if (isDoc(el)) win.scrollTo(0, top);
    else el.scrollTop = top;
  }
  // Sticky / fixed bars stay at the top whatever the scroll, so they are never an anchor.
  function pinned(el: Element | null): boolean {
    while (el && el !== doc.body && el !== doc.documentElement) {
      const p = win.getComputedStyle(el).position;
      if (p === 'fixed' || p === 'sticky') return true;
      el = el.parentElement;
    }
    return false;
  }

  function scrollState(): Record<string, unknown> {
    const sc = scroller();
    const max = maxOf(sc);
    const fraction = max > 0 ? clamp(scrollTopOf(sc) / max) : 0;
    let anchor: string | null = null;
    let offset = 0;
    const top = viewTop(sc) + 2;
    const sr = isDoc(sc) ? null : sc.getBoundingClientRect();
    const x = sr ? sr.left + sr.width / 2 : win.innerWidth / 2;
    // Probe just below the top edge; a gap between blocks (margins) moves the probe a little lower,
    // and the block found there is the anchor with offset 0 (off by at most the gap).
    const steps = [0, 8, 16, 32, 48, 64];
    for (let s = 0; s < steps.length && anchor === null; s++) {
      const y = top + (steps[s] ?? 0);
      const stack = doc.elementsFromPoint ? doc.elementsFromPoint(x, y) : [];
      let el: Element | null = null;
      for (let i = 0; i < stack.length; i++) {
        const c = stack[i];
        if (c && c !== sc && c !== doc.body && sc.contains(c) && !pinned(c)) {
          el = c;
          break;
        }
      }
      while (el && el !== sc && el !== doc.body && el !== doc.documentElement) {
        const r = el.getBoundingClientRect();
        if (r.height >= 1 && r.top <= y) {
          anchor = cssPath(el);
          offset = clamp((top - 2 - r.top) / r.height);
          break;
        }
        el = el.parentElement;
      }
    }
    return { anchor, offset, fraction };
  }

  let lastScroll = 0;
  let scrollTimer: number | undefined;
  // Capture on the document catches the document's own scroll and an inner box's scroll.
  doc.addEventListener('scroll', (e) => {
    if (Date.now() < suppressScrollUntil) return;
    const t = e.target;
    const sc = scroller();
    if (!(t === doc ? isDoc(sc) : t === sc)) return; // a small inner box (code sample, table) is not the page
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
  }, { capture: true, passive: true });

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
      const sc = scroller();
      let y = (d['fraction'] as number) * maxOf(sc);
      const a = okPath(d['anchor']) ? find(d['anchor']) : null;
      if (a && sc.contains(a) && !pinned(a)) {
        const r = a.getBoundingClientRect();
        y = scrollTopOf(sc) + (r.top - viewTop(sc)) + (d['offset'] as number) * r.height;
      }
      suppressScrollUntil = Date.now() + 400;
      scrollToY(sc, y);
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
