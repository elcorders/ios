/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API?: 'mock' | 'supabase';
  readonly VITE_COMMIT_SHA?: string;
  /** Web push public key (S16); unset = push unsupported. */
  readonly VITE_VAPID_PUBLIC_KEY?: string;
  /** `on` registers the service worker in dev. */
  readonly VITE_SW_DEV?: string;
  /** Push UI: `on` (everyone), `admin` (admins only), else off. See src/lib/features.ts. */
  readonly VITE_FEATURE_PUSH?: string;
  /** Origin used in the kiosk pairing QR (S21); default = this page origin. Lets a PC on localhost pair via its LAN address. */
  readonly VITE_KIOSK_PAIR_ORIGIN?: string;
}

/** ISO build timestamp injected by vite `define`. */
declare const __BUILD_TIME__: string;
