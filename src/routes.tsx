import { createHashRouter, type RouteObject } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { RequireAuth } from './auth/RequireAuth';
import { Layout } from './components/Layout';
import { Health } from './pages/Health';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { LmsLanding } from './pages/LmsLanding';
import { NotFound } from './pages/NotFound';

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
      { path: 'login', element: <Login /> },
      { path: 'lms', element: <LmsLanding /> },
      { path: 'health', element: <Health /> },
      { path: '*', element: <NotFound /> },
    ],
  },
];

export const createRouter = () => createHashRouter(routes);
