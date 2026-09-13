import { QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom';
import { queryClient } from '../lib/queryClient';
import { routes } from '../routes/routes';

let preloaded: Promise<unknown> | null = null;

/** Imports every lazy page once, so a test's first findBy* isn't racing a cold module transform. */
function preloadRoutes(list: RouteObject[] = routes): Promise<unknown> {
  const imports: Array<Promise<unknown>> = [];
  const walk = (items: RouteObject[]) => {
    for (const route of items) {
      if (route.lazy) imports.push(route.lazy());
      if (route.children) walk(route.children);
    }
  };
  walk(list);
  return Promise.all(imports);
}

/** Renders the real route tree at a URL — the same guards, loaders, and lazy pages as production. */
export async function renderApp(
  path: string,
): Promise<RenderResult & { router: ReturnType<typeof createMemoryRouter> }> {
  preloaded ??= preloadRoutes();
  await preloaded;
  queryClient.clear();
  const router = createMemoryRouter(routes, {
    initialEntries: [path],
    future: { v7_relativeSplatPath: true, v7_partialHydration: true },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} future={{ v7_startTransition: true }} />
    </QueryClientProvider>,
  );
  return { router, ...view };
}
