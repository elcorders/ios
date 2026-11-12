import type { AdminContentRow } from '../../api/types';
import { formatColombo } from '../../lib/time';
import { messageFor } from '../../lib/errors';

export const MAX_HTML_BYTES = 2 * 1024 * 1024;

/** Title from the HTML `<title>`; parsed by DOMParser into a detached document (never rendered). */
export function titleFromHtml(html: string): string {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return (doc.title ?? '').trim().slice(0, 200);
  } catch {
    return '';
  }
}

// Viewer runs uploads in an `<iframe srcdoc>`: relative URLs resolve against the platform's address,
// so script navigation like `location.replace('#slide-2')` leaves the page and shows a blank frame.
const FRAME_NAV = /\blocation\s*\.\s*(?:replace|assign)\s*\(|\blocation\s*\.\s*href\s*=(?!=)|\b(?:window|document)\s*\.\s*location\s*=(?!=)|\bhistory\s*\.\s*(?:push|replace)State\s*\(/;

/** True when the page's scripts change the address in a way that breaks inside the viewer. `location.hash = …` is fine. */
export function hasFrameNavigation(html: string): boolean {
  const scripts = html.match(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi) ?? [];
  return scripts.some((s) => FRAME_NAV.test(s));
}

export const FRAME_NAV_WARNING =
  'This page changes the address from its script (for example location.replace("#slide-2")). Inside the tutorial viewer that leaves the page and shows a blank frame. Use location.hash = "…" instead, or remove that line, then upload again.';

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function statusLabel(row: Pick<AdminContentRow, 'status' | 'published_at'> & { release_at?: string | null }): string {
  if (row.status === 'on_session') {
    return row.release_at ? `On session · next ${formatColombo(row.release_at, { day: '2-digit', month: 'short' })} ${formatColombo(row.release_at, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}` : 'On session';
  }
  if (row.status === 'published' && !row.published_at) return 'Published (by session)';
  if (row.status === 'draft' || !row.published_at) return 'Draft';
  const when = formatColombo(row.published_at);
  return row.status === 'scheduled' ? `Scheduled ${when}` : `Published ${when}`;
}

const SPECIFIC: Record<string, string> = {
  cohort_archived: 'This cohort is archived, so its tutorials cannot be changed.',
  invalid_input: 'Check the title, summary, order and file (HTML only, max 2 MB).',
};

export function contentError(error: { code: string }): string {
  return SPECIFIC[error.code] ?? messageFor(error);
}

/** Read a picked file as text (File.text(), with a FileReader fallback for older engines). */
export function readFileText(f: File): Promise<string> {
  if (typeof f.text === 'function') return f.text();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error);
    r.readAsText(f);
  });
}
