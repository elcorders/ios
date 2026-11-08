import { useEffect, useState } from 'react';

export type Platform = 'ios-safari' | 'ios-other' | 'android-chrome' | 'android-other' | 'desktop';

/** Chrome's install prompt event (not in lib.dom). */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function detectPlatform(ua: string, maxTouchPoints = 0): Platform {
  // iPadOS 13+ reports a Mac user agent; touch support tells it apart.
  const isIos = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
  if (isIos) {
    const other = /CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|DuckDuckGo|Instagram|FBAN|FBAV|Line\//.test(ua);
    return other ? 'ios-other' : 'ios-safari';
  }
  if (/Android/.test(ua)) {
    const other = /SamsungBrowser|Firefox|OPR\/|EdgA|UCBrowser/.test(ua);
    return other || !/Chrome\//.test(ua) ? 'android-other' : 'android-chrome';
  }
  return 'desktop';
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const mm = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return mm || iosStandalone;
}

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // installability is optional; the site works without it
    });
  });
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

export function captureInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

/** Returns the deferred install prompt (if the browser offered one) and a function to show it. */
export function useInstallPrompt(): { canInstall: boolean; install: () => Promise<void> } {
  const [, tick] = useState(0);
  useEffect(() => {
    const l = () => tick((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return {
    canInstall: deferred !== null,
    install: async () => {
      const ev = deferred;
      if (!ev) return;
      await ev.prompt();
      await ev.userChoice;
      deferred = null;
      listeners.forEach((l) => l());
    },
  };
}

/** Test helper. */
export function _setDeferredPromptForTest(ev: BeforeInstallPromptEvent | null): void {
  deferred = ev;
  listeners.forEach((l) => l());
}
