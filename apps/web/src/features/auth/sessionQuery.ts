import type { UserDto } from '@kinfolk/shared/schemas/auth';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { useRef } from 'react';
import { api, ApiError } from '../../lib/api';

export const sessionQuery = queryOptions({
  queryKey: ['session'] as const,
  queryFn: async (): Promise<UserDto | null> => {
    try {
      const { user } = await api<{ user: UserDto }>('/api/auth/me');
      return user;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },
  staleTime: 5 * 60_000,
});

/**
 * The signed-in user, for screens under the protected layout (its loader guarantees one on
 * entry). When the session is cleared on sign-out or account deletion, the last known user is
 * kept until the navigation away completes, so the shell never re-renders into an error.
 */
export function useCurrentUser(): UserDto {
  const { data } = useQuery(sessionQuery);
  const lastKnown = useRef<UserDto | null>(data ?? null);
  if (data) lastKnown.current = data;
  if (!lastKnown.current) throw new Error('useCurrentUser used outside a signed-in route');
  return lastKnown.current;
}
