import type { KeyEvent } from '@kinfolk/shared/events/keyEvents';
import { queryOptions } from '@tanstack/react-query';
import { api } from '../../lib/api';

export interface KeyEventsResponse {
  events: KeyEvent[];
  needDates: Array<{ treeId: string; treeName: string; count: number }>;
}

export const eventsQuery = queryOptions({ queryKey: ['events'] as const, queryFn: () => api<KeyEventsResponse>('/api/events'), staleTime: 5 * 60_000 });
