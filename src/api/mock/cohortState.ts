/** Shared mock state for cohort settings that student-facing mocks also read. */
const whatsapp = new Map<string, string | null>();

/** Record the WhatsApp link saved for a cohort (called by the mock admin adapter). */
export function setMockCohortWhatsApp(cohortId: string, link: string | null): void {
  whatsapp.set(cohortId, link);
}

/** Saved link for a cohort, or undefined when nothing was saved this session. */
export function getMockCohortWhatsApp(cohortId: string): string | null | undefined {
  return whatsapp.get(cohortId);
}

export function resetMockCohortState(): void {
  whatsapp.clear();
}
