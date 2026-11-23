import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { createRouter } from './routes';
import { captureInstallPrompt, registerServiceWorker } from './lib/pwa';
import { kioskBootRedirect } from './lib/kioskMode';
import './styles.css';

// S21.F6: a paired kiosk opens straight on the kiosk, whatever URL the browser starts on.
kioskBootRedirect();
captureInstallPrompt();
registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={createRouter()} />
  </StrictMode>,
);
