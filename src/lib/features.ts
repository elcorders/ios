/**
 * Feature switches. The lab (S3) is parked on production until Fuzail turns it on:
 * on in `npm run dev` / tests, off in production builds unless VITE_FEATURE_LAB=on.
 */
export const LAB_ENABLED: boolean = import.meta.env.DEV || import.meta.env.VITE_FEATURE_LAB === 'on';
