/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API?: 'mock' | 'supabase';
  readonly VITE_COMMIT_SHA?: string;
  /** Web push public key (S16); unset = push unsupported. */
  readonly VITE_VAPID_PUBLIC_KEY?: string;
  /** `on` registers the service worker in dev. */
  readonly VITE_SW_DEV?: string;
}

/** ISO build timestamp injected by vite `define`. */
declare const __BUILD_TIME__: string;
