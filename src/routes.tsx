import { createHashRouter, type RouteObject } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { RequireAuth } from './auth/RequireAuth';
import { Layout } from './components/Layout';
import { Health } from './pages/Health';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { Survey } from './pages/Survey';
import { SecuritySetup } from './pages/SecuritySetup';
import { AdminLayout } from './pages/admin/AdminLayout';
import { KioskRemotePage } from './pages/admin/KioskRemotePage';
import { LmsLanding } from './pages/LmsLanding';
import { Resources } from './pages/Resources';
import { Tutorials } from './pages/Tutorials';
import { Materials } from './pages/Materials';
import { ContentView } from './pages/ContentView';
import { Transfer } from './pages/Transfer';
import { Lab } from './pages/Lab';
import { Notifications } from './pages/Notifications';
import { Install } from './pages/Install';
import { NotFound } from './pages/NotFound';
import { Kiosk } from './pages/kiosk/Kiosk';
import { KioskPair } from './pages/kiosk/KioskPair';

export const routes: RouteObject[] = [
  {
    path: '/',
    element: (
      <AuthProvider>
        <Layout />
      </AuthProvider>
    ),
    children: [
      { index: true, element: <RequireAuth><Home /></RequireAuth> },
      { path: 'setup', element: <RequireAuth><SecuritySetup /></RequireAuth> },
      { path: 'survey', element: <RequireAuth><Survey /></RequireAuth> },
      { path: 'resources', element: <RequireAuth><Resources /></RequireAuth> },
      { path: 'tutorials', element: <RequireAuth><Tutorials /></RequireAuth> },
      { path: 'materials', element: <RequireAuth><Materials /></RequireAuth> },
      { path: 'transfer', element: <RequireAuth><Transfer /></RequireAuth> },
      { path: 'lab', element: <RequireAuth><Lab /></RequireAuth> },
      { path: 'notifications', element: <RequireAuth><Notifications /></RequireAuth> },
      { path: 'kiosk/pair', element: <RequireAuth><KioskPair /></RequireAuth> },
      { path: 'c/:id', element: <RequireAuth><ContentView /></RequireAuth> },
      { path: 'admin/kiosks/:id/remote', element: <RequireAuth><KioskRemotePage /></RequireAuth> },
      { path: 'admin/*', element: <RequireAuth><AdminLayout /></RequireAuth> },
      { path: 'login', element: <Login /> },
      { path: 'lms', element: <LmsLanding /> },
      { path: 'health', element: <Health /> },
      { path: 'install', element: <Install /> },
      { path: '*', element: <NotFound /> },
    ],
  },
  // S21: kiosk is full screen, outside the app Layout and the person's session.
  { path: '/kiosk', element: <Kiosk /> },
  { path: '/kiosk/c/:id', element: <Kiosk /> },
];

export const createRouter = () => createHashRouter(routes);
