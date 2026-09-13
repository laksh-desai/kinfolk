import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // Retry only what might succeed next time; a 403 or 404 won't.
        retry: (failureCount, error) => error instanceof ApiError && error.isTransient && failureCount < 2,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      },
      mutations: { retry: false },
    },
  });
}

/** The app's single client; route loaders read through it so data is fetched once. */
export const queryClient = createQueryClient();
