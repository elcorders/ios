import { createHashRouter, type RouteObject } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Health } from './pages/Health';
import { Home } from './pages/Home';
import { LmsLanding } from './pages/LmsLanding';
import { NotFound } from './pages/NotFound';

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'lms', element: <LmsLanding /> },
      { path: 'health', element: <Health /> },
      { path: '*', element: <NotFound /> },
    ],
  },
];

export const createRouter = () => createHashRouter(routes);
