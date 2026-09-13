import type { RouteObject } from 'react-router-dom';
import { AppShell } from './AppShell';
import { redirectIfSignedInLoader, requireUserLoader, rootLoader } from './guards';
import { NotFoundRoute } from './NotFoundRoute';
import { RootLayout } from './RootLayout';
import { RouteErrorBoundary } from './RouteErrorBoundary';
import type { RouteHandle } from './routeHandle';
import { SplashScreen } from './SplashScreen';

const handle = (title: RouteHandle['title']): RouteHandle => ({ title });

/**
 * Every screen is addressable by URL and restorable from it alone. Page modules are split per
 * route (lazy); guards are not, so auth is resolved before any page code even downloads.
 */
export const routes: RouteObject[] = [
  {
    id: 'root',
    element: <RootLayout />,
    errorElement: <RouteErrorBoundary />,
    loader: rootLoader,
    HydrateFallback: SplashScreen,
    children: [
      {
        loader: redirectIfSignedInLoader,
        errorElement: <RouteErrorBoundary />,
        children: [
          { path: 'login', handle: handle('Sign in'), lazy: () => import('../features/auth/SignInRoute') },
          { path: 'signup', handle: handle('Create your account'), lazy: () => import('../features/auth/SignUpRoute') },
          {
            path: 'forgot-password',
            handle: handle('Reset your password'),
            lazy: () => import('../features/auth/ForgotPasswordRoute'),
          },
          {
            path: 'forgot-password/verify',
            handle: handle('Enter your code'),
            lazy: () => import('../features/auth/VerifyCodeRoute'),
          },
          {
            path: 'forgot-password/reset',
            handle: handle('Choose a new password'),
            lazy: () => import('../features/auth/ResetPasswordRoute'),
          },
        ],
      },
      {
        id: 'app',
        loader: requireUserLoader,
        element: <AppShell />,
        errorElement: <RouteErrorBoundary />,
        children: [
          {
            index: true,
            handle: handle('Your family trees'),
            errorElement: <RouteErrorBoundary />,
            lazy: () => import('../features/dashboard/DashboardRoute'),
          },
          {
            path: 'account',
            handle: handle('Account'),
            errorElement: <RouteErrorBoundary />,
            lazy: () => import('../features/account/AccountRoute'),
          },
        ],
      },
      { path: '*', handle: handle('Page not found'), element: <NotFoundRoute /> },
    ],
  },
];
