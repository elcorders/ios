/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API?: 'mock' | 'supabase';
  readonly VITE_COMMIT_SHA?: string;
}

/** ISO build timestamp injected by vite `define`. */
declare const __BUILD_TIME__: string;
