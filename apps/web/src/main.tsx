import '@fontsource-variable/inter';
import '@fontsource-variable/source-serif-4';
import './styles.css';
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { applyTheme, watchSystemTheme } from './lib/preferences';
import { queryClient } from './lib/queryClient';
import { routes } from './routes/routes';

applyTheme();
watchSystemTheme();

const router = createBrowserRouter(routes, {
  future: { v7_relativeSplatPath: true, v7_fetcherPersist: true, v7_normalizeFormMethod: true, v7_skipActionErrorRevalidation: true, v7_partialHydration: true },
});

const container = document.getElementById('root');
if (!container) throw new Error('index.html is missing #root');

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} future={{ v7_startTransition: true }} />
    </QueryClientProvider>
  </StrictMode>,
);
