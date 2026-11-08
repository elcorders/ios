import type { ReactNode } from 'react';
import { detectPlatform, isStandalone, useInstallPrompt, type Platform } from '../lib/pwa';
import './install.css';

const svgProps = {
  className: 'picto',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

function ShareIcon() {
  return (
    <svg {...svgProps}>
      <path d="M12 15V3M8 7l4-4 4 4" />
      <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  );
}
function AddIcon() {
  return (
    <svg {...svgProps}>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}
function MenuIcon() {
  return (
    <svg {...svgProps}>
      <circle cx="12" cy="5" r="1.2" fill="currentColor" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
      <circle cx="12" cy="19" r="1.2" fill="currentColor" />
    </svg>
  );
}
function SafariIcon() {
  return (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5l-2 5-5 2 2-5z" />
    </svg>
  );
}

function Steps({ children }: { children: ReactNode }) {
  return <ol className="install-steps">{children}</ol>;
}

function PlatformSteps({ platform }: { platform: Platform }) {
  switch (platform) {
    case 'ios-safari':
      return (
        <section className="stack" data-testid="steps-ios">
          <h2>iPhone or iPad (Safari)</h2>
          <Steps>
            <li>Tap the Share button at the bottom of Safari.<ShareIcon /></li>
            <li>Scroll down and tap "Add to Home Screen".<AddIcon /></li>
            <li>Tap "Add". The NIBM iOS icon appears on your home screen.</li>
          </Steps>
        </section>
      );
    case 'ios-other':
      return (
        <section className="stack" data-testid="steps-ios-other">
          <h2>Open this page in Safari first</h2>
          <p className="install-note">
            On iPhone and iPad, only Safari can add apps to the home screen. Copy this page's address, open Safari, paste it,
            then follow the steps below.
          </p>
          <Steps>
            <li>Open this page in Safari.<SafariIcon /></li>
            <li>Tap the Share button.<ShareIcon /></li>
            <li>Tap "Add to Home Screen", then "Add".<AddIcon /></li>
          </Steps>
        </section>
      );
    case 'android-chrome':
      return (
        <section className="stack" data-testid="steps-android">
          <h2>Android (Chrome)</h2>
          <Steps>
            <li>Tap the menu button at the top right of Chrome.<MenuIcon /></li>
            <li>Tap "Install app" (or "Add to Home screen").<AddIcon /></li>
            <li>Tap "Install". The icon appears on your home screen.</li>
          </Steps>
        </section>
      );
    case 'android-other':
      return (
        <section className="stack" data-testid="steps-android-other">
          <h2>Android</h2>
          <p className="muted">Chrome works best. If you use another browser, open its menu and look for "Install app" or "Add to Home screen".</p>
          <Steps>
            <li>Open the browser menu.<MenuIcon /></li>
            <li>Tap "Install app" or "Add to Home screen".<AddIcon /></li>
          </Steps>
        </section>
      );
    default:
      return (
        <section className="stack" data-testid="steps-desktop">
          <h2>Computer</h2>
          <p className="muted">
            In Chrome or Edge, click the install icon at the right end of the address bar, or open the menu and choose "Install NIBM iOS".
            Students usually use a phone: open this page on your phone to install it there.
          </p>
        </section>
      );
  }
}

export function Install() {
  const platform = detectPlatform(navigator.userAgent, navigator.maxTouchPoints);
  const standalone = isStandalone();
  const { canInstall, install } = useInstallPrompt();

  return (
    <div className="stack">
      <h1>Install the app</h1>
      <p className="muted">Add NIBM iOS to your home screen to open it like an app, without the browser bars.</p>
      {standalone ? (
        <p className="install-done" role="status">Already installed. You are using the app.</p>
      ) : (
        <>
          {canInstall && (
            <button type="button" className="primary" onClick={() => void install()}>
              Install
            </button>
          )}
          <PlatformSteps platform={platform} />
          <p className="muted">After installing, open the app and sign in once with your passkey.</p>
        </>
      )}
    </div>
  );
}
