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

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function statusLabel(row: Pick<AdminContentRow, 'status' | 'published_at'>): string {
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
