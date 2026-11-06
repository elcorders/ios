import { createHashRouter, type RouteObject } from 'react-router-dom';
import { Layout } from './components/Layout';
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
      { path: '*', element: <NotFound /> },
    ],
  },
];

export const createRouter = () => createHashRouter(routes);
