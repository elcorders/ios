const EVENT = 'ios:transfers-open-count';

/** Lets the Transfers page tell the admin tab bar how many requests are open. */
export function announceOpenCount(cohortId: string, count: number): void {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { cohortId, count } }));
}

export function onOpenCount(handler: (cohortId: string, count: number) => void): () => void {
  const fn = (e: Event) => {
    const d = (e as CustomEvent<{ cohortId: string; count: number }>).detail;
    handler(d.cohortId, d.count);
  };
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}
