import * as Tooltip from '@radix-ui/react-tooltip';
import { useEffect, useRef } from 'react';
import { Outlet, ScrollRestoration, useLocation, useNavigate } from 'react-router-dom';
import { IconSprite } from '../components/IconSprite';
import { LiveRegions } from '../components/LiveRegions';
import { Toaster } from '../components/Toaster';
import { sessionQuery } from '../features/auth/sessionQuery';
import { onUnauthorized } from '../lib/api';
import { queryClient } from '../lib/queryClient';
import { toast } from '../lib/toast';
import { DocumentTitle } from './DocumentTitle';

export function RootLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const locationRef = useRef(location);
  locationRef.current = location;

  useEffect(() => {
    onUnauthorized(() => {
      const { pathname, search } = locationRef.current;
      if (pathname === '/login') return;
      const returnTo = `${pathname}${search}`;
      queryClient.setQueryData(sessionQuery.queryKey, null);
      toast({ title: 'Your session has ended', description: 'Please sign in again to continue.', tone: 'error' });
      navigate(`/login?${new URLSearchParams({ returnTo })}`, { replace: true });
    });
    return () => onUnauthorized(null);
  }, [navigate]);

  useEffect(() => {
    // Move focus to the new page's main heading region so screen readers hear the navigation.
    const main = document.getElementById('main');
    if (main && document.activeElement === document.body) main.focus({ preventScroll: true });
  }, [location.pathname]);

  return (
    <Tooltip.Provider delayDuration={400}>
      <IconSprite />
      <DocumentTitle />
      <Outlet />
      <LiveRegions />
      <Toaster />
      <ScrollRestoration />
    </Tooltip.Provider>
  );
}
