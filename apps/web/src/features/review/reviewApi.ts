import type { ReviewAssignmentDto, ReviewStateDto, ReviewTreeDto, SubmitReviewInput } from '@kinfolk/shared/schemas/review';
import { queryOptions } from '@tanstack/react-query';
import { api } from '../../lib/api';

export const reviewStateQuery = (treeId: string) =>
  queryOptions({ queryKey: ['tree', treeId, 'review'] as const, queryFn: () => api<ReviewStateDto>(`/api/trees/${treeId}/review`), staleTime: 30_000 });

export const reviewTreeQuery = (token: string) =>
  queryOptions({ queryKey: ['review', token] as const, queryFn: () => api<ReviewTreeDto>(`/api/review/${encodeURIComponent(token)}`), retry: false });

export const reviewApi = {
  submit: (treeId: string, input: SubmitReviewInput) => api<{ review: ReviewAssignmentDto }>(`/api/trees/${treeId}/review`, { method: 'POST', body: input }),
  withdraw: (treeId: string) => api<undefined>(`/api/trees/${treeId}/review`, { method: 'DELETE' }),
  resubmit: (treeId: string) => api<{ review: ReviewAssignmentDto }>(`/api/trees/${treeId}/review/resubmit`, { method: 'POST' }),
  resolve: (treeId: string, changeRequestId: string) => api<undefined>(`/api/trees/${treeId}/change-requests/${changeRequestId}/resolve`, { method: 'POST' }),
  approve: (token: string) => api<undefined>(`/api/review/${encodeURIComponent(token)}/approve`, { method: 'POST' }),
  requestChanges: (token: string, body: string) => api<{ changeRequest: { id: string } }>(`/api/review/${encodeURIComponent(token)}/changes`, { method: 'POST', body: { body } }),
};
