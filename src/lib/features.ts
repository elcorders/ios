/**
 * Feature switches. The lab (S3) is admin-only on production until Fuzail opens it to students:
 * on for everyone in `npm run dev` / tests, and in production builds with VITE_FEATURE_LAB=on.
 * UI visibility only — the backend enforces who may book (RLS / RPC checks).
 */
export const LAB_ENABLED: boolean = import.meta.env.DEV || import.meta.env.VITE_FEATURE_LAB === 'on';

/** Lab pages are visible to admins always, to everyone else when LAB_ENABLED. */
export const labVisible = (me: { is_admin?: boolean } | null | undefined): boolean => LAB_ENABLED || !!me?.is_admin;
